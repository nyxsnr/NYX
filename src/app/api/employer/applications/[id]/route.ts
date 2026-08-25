import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { optionalLongText, optionalShortText, uuid } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { updateApplicationStatus } from '@/lib/domain/applications';

const params = z.object({ id: uuid });
const body = z.object({
  status: z.enum(['VIEWED', 'SHORTLISTED', 'INTERVIEWING', 'OFFERED', 'HIRED', 'REJECTED']),
  notes: optionalLongText(2000),
  rejectionReason: optionalShortText(300),
});

/**
 * Decide on an application.
 *
 * The decision is always a human's, recorded against their user id. Nothing in
 * this codebase auto-rejects a candidate on a score.
 */
export const PATCH = route(
  { params, body, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:application:decide', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    await requireEmployer(ctx.auth.user.id);

    await updateApplicationStatus({
      applicationId: ctx.params.id,
      status: ctx.body.status,
      actorId: ctx.auth.user.id,
      actorRole: 'EMPLOYER',
      notes: ctx.body.notes ?? null,
      rejectionReason: ctx.body.rejectionReason ?? null,
    });

    return ok({ status: ctx.body.status });
  },
);
