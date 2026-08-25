/**
 * Session management.
 *
 * A session token is 32 random bytes. The browser gets `<token>.<hmac>` in an
 * httpOnly cookie; the database stores only sha256(token). That split means:
 *
 *   * a database dump yields no usable cookies (hashes only), and
 *   * a forged or truncated cookie is rejected by the HMAC before it ever
 *     costs us a database round-trip.
 *
 * Sessions slide: each use extends the expiry, up to an absolute lifetime.
 */
import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { sql, type Db } from '@/lib/db/client';
import { getEnv, isProduction } from '@/lib/config/env';
import type { UserRole } from './rbac';

export const SESSION_COOKIE = 'kazios_session';
export const CSRF_COOKIE = 'kazios_csrf';
export const CSRF_HEADER = 'x-kazios-csrf';

/** Sliding window: a session unused for this long expires. */
const IDLE_TTL_DAYS = 30;
/** Hard cap regardless of activity. */
const ABSOLUTE_TTL_DAYS = 90;

const b64url = (buf: Buffer) => buf.toString('base64url');

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function signToken(token: string): string {
  return b64url(createHmac('sha256', getEnv().SESSION_SECRET).update(token).digest());
}

/** Constant-time comparison that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Split and verify a cookie value, returning the raw token if it is authentic. */
export function parseSessionCookie(value: string | undefined): string | null {
  if (!value) return null;
  const idx = value.lastIndexOf('.');
  if (idx <= 0) return null;
  const token = value.slice(0, idx);
  const signature = value.slice(idx + 1);
  if (!token || !signature) return null;
  return safeEqual(signature, signToken(token)) ? token : null;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  locale: string;
  phone: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  isDemo: boolean;
}

export interface AuthContext {
  user: SessionUser;
  sessionId: string;
}

interface SessionRow {
  session_id: string;
  expires_at: Date;
  created_at: Date;
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: SessionUser['status'];
  locale: string;
  phone: string | null;
  email_verified_at: Date | null;
  phone_verified_at: Date | null;
  is_demo: boolean;
}

/**
 * Create a session row and set the cookies. Returns the CSRF token so a
 * sign-in response can hand it straight to the client.
 */
export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
  db: Db = sql,
): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
  const token = b64url(randomBytes(32));
  const expiresAt = new Date(Date.now() + IDLE_TTL_DAYS * 86_400_000);

  const rows = await db<{ id: string }[]>`
    INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
    VALUES (
      ${userId},
      ${hashToken(token)},
      ${meta.ip ?? null}::inet,
      ${meta.userAgent ?? null},
      ${expiresAt}
    )
    RETURNING id
  `;
  if (!rows[0]) throw new Error('Failed to create session.');

  const csrfToken = deriveCsrfToken(token);
  const store = await cookies();
  const secure = isProduction();

  store.set(SESSION_COOKIE, `${token}.${signToken(token)}`, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  // Readable by JS on purpose: the client echoes it back in a header, which is
  // the double-submit half of CSRF protection. It carries no authority alone.
  store.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return { token, csrfToken, expiresAt };
}

/** CSRF token bound to the session, so it cannot be replayed across sessions. */
export function deriveCsrfToken(sessionToken: string): string {
  return b64url(
    createHmac('sha256', getEnv().SESSION_SECRET).update(`csrf:${sessionToken}`).digest(),
  );
}

/**
 * Resolve the current session from cookies.
 *
 * Returns null for every failure mode (absent, forged, expired, revoked,
 * closed account) — callers must not be able to tell them apart.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = parseSessionCookie(store.get(SESSION_COOKIE)?.value);
  if (!token) return null;

  const rows = await sql<SessionRow[]>`
    SELECT
      s.id AS session_id, s.expires_at, s.created_at,
      u.id AS user_id, u.email, u.full_name, u.role, u.status, u.locale, u.phone,
      u.email_verified_at, u.phone_verified_at, u.is_demo
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.deleted_at IS NULL
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  // Absolute lifetime cap: a session cannot be kept alive forever by activity.
  if (Date.now() - row.created_at.getTime() > ABSOLUTE_TTL_DAYS * 86_400_000) {
    await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${row.session_id}`;
    return null;
  }

  // Suspended and closed accounts keep their row but lose their session.
  if (row.status === 'SUSPENDED' || row.status === 'CLOSED') return null;

  // Slide the expiry, but only once an hour to avoid a write per request.
  const remainingMs = row.expires_at.getTime() - Date.now();
  if (remainingMs < (IDLE_TTL_DAYS - 1) * 86_400_000) {
    const next = new Date(Date.now() + IDLE_TTL_DAYS * 86_400_000);
    await sql`
      UPDATE sessions SET expires_at = ${next}, last_seen_at = now()
      WHERE id = ${row.session_id}
    `;
  }

  return {
    sessionId: row.session_id,
    user: {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      locale: row.locale,
      phone: row.phone,
      emailVerifiedAt: row.email_verified_at,
      phoneVerifiedAt: row.phone_verified_at,
      isDemo: row.is_demo,
    },
  };
}

/** Revoke the current session and clear cookies. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = parseSessionCookie(store.get(SESSION_COOKIE)?.value);
  if (token) {
    await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)}`;
  }
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

/** Revoke every session for a user — used on password change and by admins. */
export async function revokeAllSessions(userId: string, db: Db = sql): Promise<number> {
  const rows = await db<{ id: string }[]>`
    UPDATE sessions SET revoked_at = now()
    WHERE user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length;
}

/** Housekeeping for a scheduled job. */
export async function purgeExpiredSessions(): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM sessions
    WHERE expires_at < now() - interval '7 days'
    RETURNING id
  `;
  return rows.length;
}

export const __testing = { hashToken, signToken, safeEqual };
