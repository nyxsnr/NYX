/**
 * Rate limiting.
 *
 * Backed by a Postgres table so limits survive serverless cold starts and are
 * shared across instances — an in-memory counter on Vercel would reset on
 * every new lambda and protect nothing. A single upsert per check keeps the
 * cost to one round trip.
 *
 * Swap the store for Redis when volume justifies it; the interface stays.
 */
import 'server-only';
import { sql } from '@/lib/db/client';
import { rateLimited } from './errors';

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * Named policies. Login and signup are deliberately strict: they are the
 * endpoints attackers actually hammer.
 */
export const RATE_LIMITS = {
  login: { limit: 8, windowSeconds: 300 },
  signup: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
  verification: { limit: 6, windowSeconds: 600 },
  // AI calls cost real money, so they are limited per user, not per IP.
  ai: { limit: 30, windowSeconds: 3600 },
  aiHeavy: { limit: 10, windowSeconds: 3600 },
  upload: { limit: 20, windowSeconds: 3600 },
  apply: { limit: 40, windowSeconds: 3600 },
  write: { limit: 120, windowSeconds: 60 },
  read: { limit: 600, windowSeconds: 60 },
  message: { limit: 60, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter: number;
}

/**
 * Fixed-window counter. Chosen over a sliding log because it is one statement
 * and one row; the burst allowance at a window boundary is acceptable for
 * these limits.
 */
export async function checkRateLimit(
  name: RateLimitName,
  identifier: string,
  overrides?: Partial<RateLimitRule>,
): Promise<RateLimitResult> {
  const rule = { ...RATE_LIMITS[name], ...overrides };
  const bucket = `${name}:${identifier}`;
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  const rows = await sql<{ count: number }[]>`
    INSERT INTO rate_limits (bucket, window_start, count)
    VALUES (${bucket}, ${windowStart}, 1)
    ON CONFLICT (bucket, window_start)
      DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `;

  const count = rows[0]?.count ?? 1;
  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    limit: rule.limit,
    resetAt,
    retryAfter,
  };
}

/** Throws a 429 when the limit is exceeded. */
export async function enforceRateLimit(
  name: RateLimitName,
  identifier: string,
  overrides?: Partial<RateLimitRule>,
): Promise<RateLimitResult> {
  const result = await checkRateLimit(name, identifier, overrides);
  if (!result.allowed) throw rateLimited(result.retryAfter);
  return result;
}

/** Clear counters for one identifier — called after a successful login. */
export async function clearRateLimit(name: RateLimitName, identifier: string): Promise<void> {
  await sql`DELETE FROM rate_limits WHERE bucket = ${`${name}:${identifier}`}`;
}

/** Housekeeping for a scheduled job. */
export async function purgeOldRateLimits(): Promise<number> {
  const rows = await sql<{ bucket: string }[]>`
    DELETE FROM rate_limits WHERE window_start < now() - interval '1 day' RETURNING bucket
  `;
  return rows.length;
}

/**
 * Best-effort client IP. Trusts x-forwarded-for only because Vercel strips and
 * re-sets it at the edge; behind a different proxy this must be revisited.
 */
export function clientIp(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? headers.get('cf-connecting-ip') ?? 'unknown';
}
