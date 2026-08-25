import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created } from '@/lib/http/response';
import { email, locale, optionalKenyanPhone, shortText } from '@/lib/validation/common';
import { signup } from '@/lib/domain/accounts';
import { createSession } from '@/lib/auth/session';
import { homePathFor } from '@/lib/auth/rbac';

const body = z.object({
  email,
  password: z.string().min(1, 'Enter a password.').max(200),
  fullName: shortText(120),
  role: z.enum(['WORKER', 'EMPLOYER']),
  phone: optionalKenyanPhone,
  companyName: shortText(150).optional(),
  locale: locale.default('en'),
  // Explicit consent, recorded because the platform handles employment data.
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms to continue.' }) }),
});

export const POST = route({ body, rateLimit: { name: 'signup', by: 'ip' } }, async (ctx) => {
  const result = await signup({
    email: ctx.body.email,
    password: ctx.body.password,
    fullName: ctx.body.fullName,
    role: ctx.body.role,
    phone: ctx.body.phone ?? null,
    companyName: ctx.body.companyName,
    locale: ctx.body.locale,
    ip: ctx.ip,
    userAgent: ctx.request.headers.get('user-agent'),
  });

  const session = await createSession(result.userId, {
    ip: ctx.ip,
    userAgent: ctx.request.headers.get('user-agent'),
  });

  return created({
    userId: result.userId,
    role: result.role,
    redirectTo: result.role === 'WORKER' ? '/worker/onboarding' : '/employer/onboarding',
    homePath: homePathFor(result.role),
    csrfToken: session.csrfToken,
  });
});
