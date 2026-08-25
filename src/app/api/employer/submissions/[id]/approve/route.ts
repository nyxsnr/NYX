import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { optionalLongText, rating, uuid } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { approveWork } from '@/lib/domain/applications';
import { formatMoney } from '@/lib/payments/ledger';

const params = z.object({ id: uuid });
const body = z.object({
  qualityRating: rating.optional(),
  notes: optionalLongText(2000),
});

/**
 * Approve submitted work.
 *
 * Approval releases escrow in the same operation — an employer cannot accept
 * work and leave the worker unpaid.
 */
export const POST = route(
  { params, body, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:payment:release', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    await requireEmployer(ctx.auth.user.id);

    const result = await approveWork({
      submissionId: ctx.params.id,
      actorId: ctx.auth.user.id,
      qualityRating: ctx.body.qualityRating ?? null,
      notes: ctx.body.notes ?? null,
    });

    return ok({
      approved: true,
      assignmentId: result.assignmentId,
      paidToWorker: result.netPaid,
      message: `Work approved and ${formatMoney(result.netPaid)} released to the worker.`,
    });
  },
);
