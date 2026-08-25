import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created } from '@/lib/http/response';
import { notFound } from '@/lib/http/errors';
import { optionalLongText, positiveMoneyMinor, uuid } from '@/lib/validation/common';
import { getTask, taskRequirements } from '@/lib/domain/opportunities';
import { buildMatchProfile, requireWorkerProfile } from '@/lib/domain/workers';
import { computeMatch } from '@/lib/matching';
import { applyToTask } from '@/lib/domain/applications';

const params = z.object({ id: uuid });
const body = z.object({
  proposal: optionalLongText(4000),
  bidAmount: positiveMoneyMinor.optional(),
  estimatedDays: z.number().int().min(1).max(365).optional(),
  /** Set by the client when the Career Agent helped draft the proposal. */
  aiAssisted: z.boolean().default(false),
});

export const POST = route(
  { params, body, auth: 'required', roles: ['WORKER'], permission: 'worker:apply', rateLimit: { name: 'apply', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    const task = await getTask(ctx.params.id);
    if (!task || task.status !== 'PUBLISHED') throw notFound('Task');

    const matchProfile = await buildMatchProfile(profile.id);
    const match = computeMatch(matchProfile, taskRequirements(task));

    const result = await applyToTask({
      taskId: task.id,
      workerProfileId: profile.id,
      workerUserId: ctx.auth.user.id,
      proposal: ctx.body.proposal ?? null,
      bidAmount: ctx.body.bidAmount ?? null,
      estimatedDays: ctx.body.estimatedDays ?? null,
      aiAssisted: ctx.body.aiAssisted,
      match,
    });

    return created({
      applicationId: result.applicationId,
      matchScore: match.score,
      matchBand: match.band,
      gaps: match.gaps,
    });
  },
);
