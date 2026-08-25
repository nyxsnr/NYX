import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created } from '@/lib/http/response';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { startAttempt } from '@/lib/domain/simulations';

const body = z.object({ templateSlug: z.string().trim().min(1).max(100) });

/** Start (or resume) an attempt at a simulation. */
export const POST = route(
  { body, auth: 'required', roles: ['WORKER'], permission: 'worker:simulation:attempt', rateLimit: { name: 'ai', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    const attempt = await startAttempt({
      templateSlug: ctx.body.templateSlug,
      profileId: profile.id,
      userId: ctx.auth.user.id,
    });

    return created({
      id: attempt.id,
      title: attempt.title,
      brief: attempt.brief,
      materials: attempt.materials,
      responseFormat: attempt.response_format,
      minutes: attempt.time_limit_minutes,
      startedAt: attempt.started_at,
      expiresAt: attempt.expires_at,
      // The rubric labels are shown so the exercise is not a guessing game;
      // the weights are not, so the response is not gamed to the weighting.
      assessedOn: (attempt.rubric as Array<{ label?: string }>).map((r) => r.label).filter(Boolean),
    });
  },
);
