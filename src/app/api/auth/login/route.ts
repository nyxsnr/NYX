import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { email } from '@/lib/validation/common';
import { login } from '@/lib/domain/accounts';
import { createSession } from '@/lib/auth/session';
import { homePathFor } from '@/lib/auth/rbac';
import { clearRateLimit } from '@/lib/http/rate-limit';

const body = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(200),
});

export const POST = route({ body, rateLimit: { name: 'login', by: 'ip' } }, async (ctx) => {
  const result = await login({ email: ctx.body.email, password: ctx.body.password, ip: ctx.ip });

  // A successful sign-in clears the IP's failure budget so a shared connection
  // (a cyber cafe, a household) is not locked out by one person's typos.
  await clearRateLimit('login', ctx.ip);

  const session = await createSession(result.userId, {
    ip: ctx.ip,
    userAgent: ctx.request.headers.get('user-agent'),
  });

  return ok({
    userId: result.userId,
    role: result.role,
    fullName: result.fullName,
    emailVerified: result.emailVerified,
    homePath: homePathFor(result.role),
    csrfToken: session.csrfToken,
  });
});
