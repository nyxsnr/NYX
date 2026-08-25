/**
 * Server-side page guards.
 *
 * Layouts call these before rendering. Authorization is re-checked on every
 * request against the session row in the database — never inferred from a
 * cookie value, a client prop, or the URL.
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { getAuthContext, type AuthContext } from './session';
import { homePathFor, type UserRole } from './rbac';

/** Require a session, optionally of specific roles. */
export async function requireAuth(roles?: UserRole[], returnTo?: string): Promise<AuthContext> {
  const auth = await getAuthContext();

  if (!auth) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/login${next}`);
  }

  // Signed in but wrong role: send them to their own area rather than showing
  // a dead end.
  if (roles && !roles.includes(auth.user.role)) {
    redirect(homePathFor(auth.user.role));
  }

  return auth;
}

/** Redirect an already-signed-in visitor away from public auth pages. */
export async function redirectIfAuthenticated(): Promise<void> {
  const auth = await getAuthContext();
  if (auth) redirect(homePathFor(auth.user.role));
}
