import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created, ok } from '@/lib/http/response';
import { json, sql } from '@/lib/db/client';
import { shortText, uuid } from '@/lib/validation/common';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { AIService } from '@/lib/ai/service';
import { track } from '@/lib/analytics';

export const GET = route({ auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const rows = await sql<
    Array<{ id: string; role_title: string; interview_kind: string; state: string; overall_score: number | null; question_count: number; started_at: Date; completed_at: Date | null }>
  >`
    SELECT id, role_title, interview_kind, state, overall_score, question_count, started_at, completed_at
    FROM interview_sessions
    WHERE worker_profile_id = ${profile.id}
    ORDER BY started_at DESC LIMIT 20
  `;
  return ok(rows);
});

const body = z.object({
  roleTitle: shortText(150),
  interviewKind: z.enum(['BEHAVIOURAL', 'TECHNICAL', 'MIXED', 'SCREENING']).default('MIXED'),
  jobId: uuid.optional(),
});

const MAX_QUESTIONS = 6;

/** Start an interview and return the first question. */
export const POST = route(
  { body, auth: 'required', roles: ['WORKER'], permission: 'ai:use', rateLimit: { name: 'ai', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);

    const first = await AIService.simulateInterview(
      {
        roleTitle: ctx.body.roleTitle,
        interviewKind: ctx.body.interviewKind,
        previousQuestions: [],
        maxQuestions: MAX_QUESTIONS,
      },
      { userId: ctx.auth.user.id },
    );

    // `lookingFor` is stored but never returned before the interview ends —
    // showing it would turn the exercise into a comprehension test.
    const transcript = [
      { role: 'interviewer', content: first.data.question, kind: first.data.kind, lookingFor: first.data.lookingFor, at: new Date().toISOString() },
    ];

    const rows = await sql<{ id: string }[]>`
      INSERT INTO interview_sessions (worker_profile_id, job_id, role_title, interview_kind, transcript, question_count)
      VALUES (
        ${profile.id}, ${ctx.body.jobId ?? null}, ${ctx.body.roleTitle}, ${ctx.body.interviewKind},
        ${json(transcript)}, 1
      )
      RETURNING id
    `;

    await track({ event: 'interview_started', userId: ctx.auth.user.id, role: 'WORKER', properties: { kind: ctx.body.interviewKind } });

    return created({
      sessionId: rows[0]?.id,
      question: first.data.question,
      kind: first.data.kind,
      questionNumber: 1,
      totalQuestions: MAX_QUESTIONS,
      isFinal: false,
    });
  },
);
