import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { json, sql } from '@/lib/db/client';
import { uuid } from '@/lib/validation/common';
import { getReadiness, listWorkerSkills, requireWorkerProfile } from '@/lib/domain/workers';
import { AIService } from '@/lib/ai/service';
import { track } from '@/lib/analytics';

const body = z.object({
  message: z.string().trim().min(1, 'Type a message.').max(4000),
  conversationId: uuid.optional(),
});

interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

/**
 * KaziOS Career Agent.
 *
 * Grounded in the worker's own profile and readiness breakdown, so advice is
 * specific rather than generic. The system prompt forbids promising a job or
 * an income; replies are checked again on the way out by the safety inspector.
 */
export const POST = route(
  { body, auth: 'required', roles: ['WORKER'], permission: 'ai:use', rateLimit: { name: 'ai', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    const [readiness, skills] = await Promise.all([
      getReadiness(profile.id),
      listWorkerSkills(profile.id),
    ]);

    let conversationId = ctx.body.conversationId;
    let history: AgentMessage[] = [];

    if (conversationId) {
      const rows = await sql<{ messages: AgentMessage[] }[]>`
        SELECT messages FROM agent_conversations
        WHERE id = ${conversationId} AND user_id = ${ctx.auth.user.id}
      `;
      history = rows[0]?.messages ?? [];
      if (!rows[0]) conversationId = undefined;
    }

    const simulationsCompleted = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM simulation_attempts
      WHERE worker_profile_id = ${profile.id} AND state = 'EVALUATED'
    `;

    const reply = await AIService.agentReply(
      {
        message: ctx.body.message,
        workerName: profile.full_name,
        readinessScore: readiness.score,
        readinessComponents: Object.fromEntries(readiness.components.map((c) => [c.key, c.score])),
        capabilities: skills.map((s) => s.name),
        simulationsCompleted: Number(simulationsCompleted[0]?.count ?? 0),
        // Only the recent turns are sent, to bound both cost and drift.
        history: history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      },
      { userId: ctx.auth.user.id },
    );

    const now = new Date().toISOString();
    const updated: AgentMessage[] = [
      ...history,
      { role: 'user' as const, content: ctx.body.message, at: now },
      { role: 'assistant' as const, content: reply.data.reply, at: now },
    ].slice(-40);

    if (conversationId) {
      await sql`
        UPDATE agent_conversations
        SET messages = ${json(updated)}, message_count = ${updated.length}
        WHERE id = ${conversationId}
      `;
    } else {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO agent_conversations (user_id, title, messages, message_count)
        VALUES (
          ${ctx.auth.user.id}, ${ctx.body.message.slice(0, 80)},
          ${json(updated)}, ${updated.length}
        )
        RETURNING id
      `;
      conversationId = rows[0]?.id;
    }

    await track({ event: 'career_agent_message', userId: ctx.auth.user.id, role: 'WORKER' });

    return ok({
      conversationId,
      reply: reply.data.reply,
      suggestedActions: reply.data.suggestedActions,
    });
  },
);

export const GET = route({ auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const rows = await sql<Array<{ id: string; title: string | null; messages: AgentMessage[]; updated_at: Date }>>`
    SELECT id, title, messages, updated_at FROM agent_conversations
    WHERE user_id = ${ctx.auth.user.id}
    ORDER BY updated_at DESC LIMIT 10
  `;
  return ok(rows);
});
