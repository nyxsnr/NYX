import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { permissionsFor } from '@/lib/auth/rbac';
import { unreadCount } from '@/lib/notifications';

/** The current session. Returns null rather than 401 so a public page can call it. */
export const GET = route({ auth: 'optional' }, async (ctx) => {
  if (!ctx.maybeAuth) return ok({ user: null });

  const { user } = ctx.maybeAuth;
  return ok({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      locale: user.locale,
      emailVerified: Boolean(user.emailVerifiedAt),
      phoneVerified: Boolean(user.phoneVerifiedAt),
      isDemo: user.isDemo,
      permissions: permissionsFor(user.role),
    },
    unreadNotifications: await unreadCount(user.id),
  });
});
