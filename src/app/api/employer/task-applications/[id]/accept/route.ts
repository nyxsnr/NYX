import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { positiveMoneyMinor, uuid } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { acceptTaskApplication } from '@/lib/domain/applications';

const params = z.object({ id: uuid });
const body = z.object({ agreedAmount: positiveMoneyMinor.optional() });

/**
 * Hire a worker for a task.
 *
 * Creates the assignment and funds escrow in one operation. If the employer's
 * balance is short, nothing is assigned and the worker is never told to start.
 */
export const POST = route(
  { params, body, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:payment:fund', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    await requireEmployer(ctx.auth.user.id);

    const result = await acceptTaskApplication({
      applicationId: ctx.params.id,
      actorId: ctx.auth.user.id,
      agreedAmount: ctx.body.agreedAmount,
    });

    return ok({
      assignmentId: result.assignmentId,
      paymentReference: result.paymentReference,
      escrowFunded: true,
    });
  },
);
