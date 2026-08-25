import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { getReadiness, recomputeReadiness, requireWorkerProfile } from '@/lib/domain/workers';

const query = z.object({ refresh: z.coerce.boolean().default(false) });

/** The full readiness breakdown, including how to improve it. */
export const GET = route({ query, auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const readiness = ctx.query.refresh
    ? await recomputeReadiness(profile.id)
    : await getReadiness(profile.id);
  return ok(readiness);
});
