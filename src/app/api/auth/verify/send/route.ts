import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sendVerificationCode } from '@/lib/domain/accounts';
import { AppError } from '@/lib/http/errors';

const body = z.object({ kind: z.enum(['EMAIL', 'PHONE']) });

export const POST = route(
  { body, auth: 'required', rateLimit: { name: 'verification', by: 'user' } },
  async (ctx) => {
    if (ctx.body.kind === 'PHONE' && !ctx.auth.user.phone) {
      throw new AppError('PRECONDITION_FAILED', 'Add a phone number to your profile first.');
    }
    const result = await sendVerificationCode({ userId: ctx.auth.user.id, kind: ctx.body.kind });
    return ok(result);
  },
);
