import { NextResponse } from 'next/server';
import { pingDb } from '@/lib/db/client';
import { getPaymentProvider } from '@/lib/payments/service';
import { getEnv } from '@/lib/config/env';

export const dynamic = 'force-dynamic';

/**
 * Liveness and dependency check.
 *
 * Deliberately reports which providers are live, so nobody has to guess
 * whether a deployment is moving real money or simulating it. It exposes no
 * secrets and no counts that would be useful to an attacker.
 */
export async function GET() {
  const database = await pingDb();
  const env = getEnv();

  const body = {
    status: database ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    checks: {
      database,
      ai: { provider: env.AI_PROVIDER, live: env.AI_PROVIDER !== 'mock' },
      payments: { provider: env.PAYMENT_PROVIDER, live: getPaymentProvider().isLive },
      storage: { provider: env.STORAGE_PROVIDER },
      notifications: { provider: env.NOTIFICATION_PROVIDER },
    },
  };

  return NextResponse.json({ data: body }, { status: database ? 200 : 503 });
}
