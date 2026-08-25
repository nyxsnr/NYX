import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { purgeExpiredSessions } from '@/lib/auth/session';
import { purgeOldRateLimits } from '@/lib/http/rate-limit';
import { expireStaleAttempts } from '@/lib/domain/simulations';
import { getEnv } from '@/lib/config/env';

export const dynamic = 'force-dynamic';

/**
 * Nightly housekeeping.
 *
 * Invoked by the Vercel cron defined in vercel.json. Authenticated with a
 * shared secret compared in constant time — this endpoint is publicly routable,
 * so a plain string comparison would leak the secret a byte at a time.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: { code: 'NOT_IMPLEMENTED', message: 'CRON_SECRET is not configured.' } },
      { status: 501 },
    );
  }

  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  const authorised = a.length === b.length && timingSafeEqual(a, b);

  if (!authorised) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Invalid cron credentials.' } },
      { status: 401 },
    );
  }

  const [sessions, rateLimits, attempts] = await Promise.all([
    purgeExpiredSessions(),
    purgeOldRateLimits(),
    expireStaleAttempts(),
  ]);

  return NextResponse.json({
    data: {
      ranAt: new Date().toISOString(),
      environment: getEnv().NODE_ENV,
      purgedSessions: sessions,
      purgedRateLimits: rateLimits,
      expiredSimulationAttempts: attempts,
    },
  });
}
