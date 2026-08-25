import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { longText, uuid } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { requestRevision } from '@/lib/domain/applications';

const params = z.object({ id: uuid });
const body = z.object({
  // Required and substantive: "please revise" with no detail wastes a worker's
  // unpaid time, so the API refuses to accept it.
  notes: longText(4000).refine((v) => v.trim().length >= 20, {
    message: 'Explain what needs to change in at least a sentence — the worker cannot act on a one-word note.',
  }),
});

export const POST = route(
  { params, body, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:submission:review', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    await requireEmployer(ctx.auth.user.id);
    await requestRevision({ submissionId: ctx.params.id, actorId: ctx.auth.user.id, notes: ctx.body.notes });
    return ok({ revisionRequested: true });
  },
);
