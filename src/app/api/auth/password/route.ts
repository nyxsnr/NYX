import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { changePassword } from '@/lib/domain/accounts';
import { createSession } from '@/lib/auth/session';

const body = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

export const POST = route(
  { body, auth: 'required', rateLimit: { name: 'passwordReset', by: 'user' } },
  async (ctx) => {
    await changePassword({
      userId: ctx.auth.user.id,
      currentPassword: ctx.body.currentPassword,
      newPassword: ctx.body.newPassword,
    });

    // The change revoked every session including this one; issue a fresh one so
    // the person who just changed their password stays signed in.
    const session = await createSession(ctx.auth.user.id, {
      ip: ctx.ip,
      userAgent: ctx.request.headers.get('user-agent'),
    });

    return ok({ changed: true, csrfToken: session.csrfToken });
  },
);
