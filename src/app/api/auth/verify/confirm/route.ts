import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { confirmVerificationCode } from '@/lib/domain/accounts';
import { AppError } from '@/lib/http/errors';

const body = z.object({
  kind: z.enum(['EMAIL', 'PHONE']),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

export const POST = route(
  { body, auth: 'required', rateLimit: { name: 'verification', by: 'user' } },
  async (ctx) => {
    const verified = await confirmVerificationCode({
      userId: ctx.auth.user.id,
      kind: ctx.body.kind,
      code: ctx.body.code,
    });
    if (!verified) {
      throw new AppError('BAD_REQUEST', 'That code is not valid or has expired. Request a new one.');
    }
    return ok({ verified: true });
  },
);
