import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created } from '@/lib/http/response';
import { positiveMoneyMinor } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { initiateDeposit } from '@/lib/payments/service';
import { track } from '@/lib/analytics';

const body = z.object({
  amountMinor: positiveMoneyMinor,
  idempotencyKey: z.string().uuid('Send a UUID idempotency key.'),
});

/** Top up the employer balance, which is what funds escrow. */
export const POST = route(
  { body, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:payment:fund', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    await requireEmployer(ctx.auth.user.id);

    const result = await initiateDeposit({
      userId: ctx.auth.user.id,
      amountMinor: ctx.body.amountMinor,
      payerPhone: ctx.auth.user.phone,
      payerEmail: ctx.auth.user.email,
      idempotencyKey: ctx.body.idempotencyKey,
    });

    await track({
      event: 'payment_initiated',
      userId: ctx.auth.user.id,
      role: 'EMPLOYER',
      properties: { amountMinor: ctx.body.amountMinor },
    });

    return created(result);
  },
);
