import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { getActivationMetrics, getEmployerRepeatRate, getFunnel, getPlatformMetrics } from '@/lib/analytics';
import { sql } from '@/lib/db/client';

/**
 * Platform metrics.
 *
 * The North Star — total income generated for workers — comes from released
 * payments in the ledger, not from analytics events, so it always reflects
 * money that actually moved.
 */
export const GET = route(
  { auth: 'required', roles: ['ADMIN'], permission: 'admin:analytics:read' },
  async () => {
    const [platform, activation, repeat, funnel, timeToWork] = await Promise.all([
      getPlatformMetrics(),
      getActivationMetrics(),
      getEmployerRepeatRate(),
      getFunnel(30),
      sql<{ median_hours: string | null }[]>`
        SELECT percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM (a.created_at - j.published_at)) / 3600
        )::text AS median_hours
        FROM applications a JOIN jobs j ON j.id = a.job_id
        WHERE a.status = 'HIRED' AND j.published_at IS NOT NULL
      `,
    ]);

    const placementRate =
      platform.totalApplications > 0
        ? Math.round((platform.totalPlacements / platform.totalApplications) * 1000) / 10
        : 0;

    return ok({
      northStar: {
        label: 'Income generated for workers',
        valueMinor: platform.workerIncomeTotal,
        currency: 'KES',
      },
      platform,
      activation: {
        ...activation,
        activationRate:
          activation.workersTotal > 0
            ? Math.round((activation.workersWhoEarned / activation.workersTotal) * 1000) / 10
            : 0,
        thirtyDayEarnRate:
          activation.workersTotal > 0
            ? Math.round((activation.workersEarnedWithin30d / activation.workersTotal) * 1000) / 10
            : 0,
      },
      employerRepeat: repeat,
      placementRate,
      medianHoursToHire: timeToWork[0]?.median_hours ? Math.round(Number(timeToWork[0].median_hours)) : null,
      funnel,
    });
  },
);
