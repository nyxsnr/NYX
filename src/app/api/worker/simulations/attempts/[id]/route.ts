import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { forbidden, notFound } from '@/lib/http/errors';
import { uuid } from '@/lib/validation/common';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { getAttempt, submitAttempt } from '@/lib/domain/simulations';

const params = z.object({ id: uuid });

export const GET = route({ params, auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const attempt = await getAttempt(ctx.params.id);
  if (!attempt) throw notFound('Simulation attempt');
  if (attempt.worker_profile_id !== profile.id) throw forbidden('That is not your simulation attempt.');

  return ok({
    id: attempt.id,
    state: attempt.state,
    title: attempt.title,
    brief: attempt.brief,
    materials: attempt.materials,
    responseFormat: attempt.response_format,
    minutes: attempt.time_limit_minutes,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    response: attempt.response,
    // Results are present only once evaluated.
    score: attempt.score,
    criterionScores: attempt.criterion_scores,
    strengths: attempt.strengths,
    weaknesses: attempt.weaknesses,
    feedback: attempt.feedback,
    evaluatorVersion: attempt.evaluator_version,
    evaluatedAt: attempt.evaluated_at,
  });
});

const body = z.object({
  response: z.string().trim().min(1, 'Write your response before submitting.').max(30_000),
  structuredResponse: z.record(z.unknown()).optional(),
  timeSpentSeconds: z.number().int().min(0).max(86_400).optional(),
});

/** Submit an attempt for scoring. */
export const POST = route(
  { params, body, auth: 'required', roles: ['WORKER'], permission: 'worker:simulation:attempt', rateLimit: { name: 'aiHeavy', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    const attempt = await submitAttempt({
      attemptId: ctx.params.id,
      profileId: profile.id,
      userId: ctx.auth.user.id,
      response: ctx.body.response,
      structuredResponse: ctx.body.structuredResponse,
      timeSpentSeconds: ctx.body.timeSpentSeconds,
    });

    return ok({
      id: attempt.id,
      state: attempt.state,
      score: attempt.score,
      criterionScores: attempt.criterion_scores,
      strengths: attempt.strengths,
      weaknesses: attempt.weaknesses,
      feedback: attempt.feedback,
      evaluatorVersion: attempt.evaluator_version,
      // Explicitly not a certification. The wording here is load-bearing.
      evidenceLabel: attempt.score !== null && attempt.score >= 60 ? 'Simulation verified' : 'Attempted',
    });
  },
);
