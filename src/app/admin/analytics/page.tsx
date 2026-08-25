import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { getActivationMetrics, getEmployerRepeatRate, getFunnel, getPlatformMetrics } from '@/lib/analytics';
import { sql } from '@/lib/db/client';
import { formatKes } from '@/lib/i18n';
import { Card, PageHeader, ScoreBar, SectionHeading, Stat } from '@/components/ui';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

/** Events grouped the way the funnel actually runs, for readability. */
const EVENT_GROUPS: Array<{ title: string; events: string[] }> = [
  { title: 'Acquisition', events: ['signup', 'employer_signup', 'onboarding_complete', 'employer_onboarding_complete'] },
  { title: 'Capability', events: ['cv_uploaded', 'cv_parsed', 'assessment_started', 'assessment_completed'] },
  { title: 'Proof', events: ['simulation_started', 'simulation_completed', 'interview_completed', 'portfolio_item_added'] },
  { title: 'Demand', events: ['job_posted', 'task_posted', 'project_decomposed'] },
  { title: 'Matching', events: ['job_viewed', 'job_applied', 'task_viewed', 'task_applied'] },
  { title: 'Conversion', events: ['candidate_shortlisted', 'candidate_hired', 'task_assigned', 'task_submitted', 'task_approved'] },
  { title: 'Money', events: ['payment_initiated', 'payment_completed', 'payout_requested'] },
  { title: 'Trust', events: ['review_submitted', 'dispute_opened', 'dispute_resolved', 'verification_approved'] },
];

export default async function AnalyticsPage() {
  await requireAuth(['ADMIN']);

  const [platform, activation, repeat, funnel, timing] = await Promise.all([
    getPlatformMetrics(),
    getActivationMetrics(),
    getEmployerRepeatRate(),
    getFunnel(30),
    sql<{ median_hours_to_hire: string | null; median_response_hours: string | null; task_completion_rate: string | null }[]>`
      SELECT
        (SELECT percentile_cont(0.5) WITHIN GROUP (
           ORDER BY extract(epoch FROM (a.created_at - j.published_at)) / 3600)::text
         FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE a.status = 'HIRED' AND j.published_at IS NOT NULL) AS median_hours_to_hire,
        (SELECT percentile_cont(0.5) WITHIN GROUP (
           ORDER BY extract(epoch FROM (a.viewed_at - a.created_at)) / 3600)::text
         FROM applications a WHERE a.viewed_at IS NOT NULL) AS median_response_hours,
        (SELECT CASE WHEN count(*) > 0
           THEN round(count(*) FILTER (WHERE status = 'APPROVED')::numeric * 100 / count(*), 1)::text END
         FROM task_assignments) AS task_completion_rate
    `,
  ]);

  const counts = new Map(funnel.map((point) => [point.event, point]));
  const t = timing[0];

  const placementRate =
    platform.totalApplications > 0 ? (platform.totalPlacements / platform.totalApplications) * 100 : 0;
  const takeRate =
    platform.workerIncomeTotal + platform.platformRevenueTotal > 0
      ? (platform.platformRevenueTotal / (platform.workerIncomeTotal + platform.platformRevenueTotal)) * 100
      : 0;

  return (
    <>
      <PageHeader title="Analytics" description="Last 30 days of events, plus the metrics the business is judged on." />

      <section className="mb-8">
        <SectionHeading title="North Star and secondary metrics" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Income generated for workers" value={formatKes(platform.workerIncomeTotal)} tone="jade" hint="From the ledger" />
          <Stat
            label="Earning within 30 days"
            value={`${activation.workersTotal ? ((activation.workersEarnedWithin30d / activation.workersTotal) * 100).toFixed(1) : '0.0'}%`}
            hint={`${activation.workersEarnedWithin30d} of ${activation.workersTotal}`}
          />
          <Stat label="Employer repeat rate" value={`${repeat.rate}%`} hint={`${repeat.repeat} of ${repeat.total} companies`} />
          <Stat label="Placement rate" value={`${placementRate.toFixed(1)}%`} hint="Hires per application" />
          <Stat label="Task completion rate" value={t?.task_completion_rate ? `${t.task_completion_rate}%` : '—'} />
          <Stat label="Average worker earnings" value={formatKes(activation.averageWorkerEarnings)} hint="Among those who earned" />
          <Stat label="Platform take rate" value={`${takeRate.toFixed(1)}%`} />
          <Stat
            label="Median time to work"
            value={activation.medianDaysToFirstIncome !== null ? `${activation.medianDaysToFirstIncome} days` : '—'}
            hint="Signup to first income"
          />
        </div>
      </section>

      <section className="mb-8">
        <SectionHeading title="Responsiveness" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="Median employer response time"
            value={t?.median_response_hours ? `${Math.round(Number(t.median_response_hours))} hours` : '—'}
            hint="Application submitted to first viewed"
          />
          <Stat
            label="Median time to hire"
            value={t?.median_hours_to_hire ? `${Math.round(Number(t.median_hours_to_hire))} hours` : '—'}
            hint="Job published to candidate hired"
          />
        </div>
      </section>

      <section>
        <SectionHeading title="Event funnel (30 days)" />
        <div className="space-y-4">
          {EVENT_GROUPS.map((group) => {
            const rows = group.events.map((event) => counts.get(event)).filter(Boolean);
            if (rows.length === 0) return null;
            const max = Math.max(...rows.map((row) => row?.occurrences ?? 0), 1);

            return (
              <Card key={group.title}>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{group.title}</h3>
                <div className="space-y-2">
                  {rows.map((row) =>
                    row ? (
                      <div key={row.event}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                          <span className="text-secondary">{row.event.replace(/_/g, ' ')}</span>
                          <span className="tabular-nums">
                            <span className="font-semibold">{row.occurrences.toLocaleString()}</span>
                            <span className="ml-2 text-muted">{row.uniqueUsers} user{row.uniqueUsers === 1 ? '' : 's'}</span>
                          </span>
                        </div>
                        <ScoreBar value={(row.occurrences / max) * 100} tone="neutral" />
                      </div>
                    ) : null,
                  )}
                </div>
              </Card>
            );
          })}

          {funnel.length === 0 ? (
            <Card>
              <p className="text-sm text-secondary">No events recorded in the last 30 days.</p>
            </Card>
          ) : null}
        </div>
      </section>
    </>
  );
}
