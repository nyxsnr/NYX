import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created } from '@/lib/http/response';
import { AppError } from '@/lib/http/errors';
import { kenyanPhone, positiveMoneyMinor } from '@/lib/validation/common';
import { requestPayout } from '@/lib/payments/service';
import { track } from '@/lib/analytics';

const body = z.object({
  amountMinor: positiveMoneyMinor,
  destinationPhone: kenyanPhone,
  idempotencyKey: z.string().uuid('Send a UUID idempotency key.'),
});

/** Withdraw earnings to mobile money. */
export const POST = route(
  { body, auth: 'required', roles: ['WORKER'], permission: 'worker:payout:request', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    // Withdrawals require a verified phone: money leaving the platform must go
    // to a number the account holder has proven they control.
    if (!ctx.auth.user.phoneVerifiedAt) {
      throw new AppError(
        'PRECONDITION_FAILED',
        'Verify your phone number before withdrawing. This protects your earnings from being sent to the wrong number.',
        { details: { requires: 'phone_verification' } },
      );
    }

    const result = await requestPayout({
      userId: ctx.auth.user.id,
      amountMinor: ctx.body.amountMinor,
      destinationPhone: ctx.body.destinationPhone,
      idempotencyKey: ctx.body.idempotencyKey,
    });

    await track({
      event: 'payout_requested',
      userId: ctx.auth.user.id,
      role: 'WORKER',
      properties: { amountMinor: ctx.body.amountMinor },
    });

    return created(result);
  },
);
