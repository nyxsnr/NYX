import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { notFound } from '@/lib/http/errors';
import { uuid } from '@/lib/validation/common';
import { sql } from '@/lib/db/client';
import { getTask } from '@/lib/domain/opportunities';
import { listWorkerSkills, requireWorkerProfile } from '@/lib/domain/workers';
import { AIService } from '@/lib/ai/service';

const params = z.object({ id: uuid });

/**
 * Draft a proposal for the worker.
 *
 * Grounded strictly in profile evidence: the response includes `claimsUsed`
 * mapping every statement to the fact behind it, and `gapsToAddress` for
 * anything the model refused to claim on the worker's behalf.
 */
export const POST = route(
  { params, auth: 'required', roles: ['WORKER'], permission: 'ai:use', rateLimit: { name: 'ai', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    const task = await getTask(ctx.params.id);
    if (!task || task.status !== 'PUBLISHED') throw notFound('Task');

    const [skills, simulations] = await Promise.all([
      listWorkerSkills(profile.id),
      sql<Array<{ title: string; score: number }>>`
        SELECT t.title, sa.score
        FROM simulation_attempts sa
        JOIN simulation_templates t ON t.id = sa.template_id
        WHERE sa.worker_profile_id = ${profile.id} AND sa.state = 'EVALUATED' AND sa.score >= 60
        ORDER BY sa.score DESC LIMIT 5
      `,
    ]);

    const verified = skills.filter(
      (s) => s.evidence_level === 'SIMULATION_VERIFIED' || s.evidence_level === 'EMPLOYER_VERIFIED',
    );

    const draft = await AIService.draftProposal(
      {
        taskTitle: task.title,
        taskDescription: task.description,
        requirements: task.required_skills ?? [],
        verifiedSkills: verified.map((s) => s.name),
        statedSkills: skills.map((s) => s.name),
        completedTasks: profile.tasks_completed,
        simulationEvidence: simulations,
      },
      { userId: ctx.auth.user.id },
    );

    return ok({
      ...draft.data,
      notice:
        'This draft uses only what is already on your profile. Read it before sending, edit it in your own words, ' +
        'and add anything true that we could not claim for you.',
    });
  },
);
