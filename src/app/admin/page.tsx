import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { getActivationMetrics, getEmployerRepeatRate, getPlatformMetrics } from '@/lib/analytics';
import { sql } from '@/lib/db/client';
import { formatKes } from '@/lib/i18n';
import { Alert, Card, PageHeader, ScoreBar, SectionHeading, Stat } from '@/components/ui';

export const metadata: Metadata = { title: 'Admin overview' };
export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  await requireAuth(['ADMIN']);

  const [platform, activation, repeat, queues] = await Promise.all([
    getPlatformMetrics(),
    getActivationMetrics(),
    getEmployerRepeatRate(),
    sql<{ pending_jobs: string; pending_tasks: string; open_disputes: string; open_fraud: string; pending_verifications: string; open_reports: string }[]>`
      SELECT
        (SELECT count(*)::text FROM jobs WHERE status = 'PENDING_REVIEW' AND deleted_at IS NULL) AS pending_jobs,
        (SELECT count(*)::text FROM tasks WHERE status = 'PENDING_REVIEW' AND deleted_at IS NULL) AS pending_tasks,
        (SELECT count(*)::text FROM disputes WHERE status IN ('OPEN','UNDER_REVIEW')) AS open_disputes,
        (SELECT count(*)::text FROM fraud_flags WHERE state = 'OPEN') AS open_fraud,
        (SELECT count(*)::text FROM verification_records WHERE state = 'PENDING'
           AND kind IN ('BUSINESS_REGISTRATION','TAX_PIN','IDENTITY')) AS pending_verifications,
        (SELECT count(*)::text FROM reports WHERE state = 'OPEN') AS open_reports
    `,
  ]);

  const q = queues[0];
  const n = (value: string | undefined) => Number(value ?? 0);
  const moderationQueue = n(q?.pending_jobs) + n(q?.pending_tasks) + n(q?.open_reports);

  const activationRate = activation.workersTotal > 0 ? (activation.workersWhoEarned / activation.workersTotal) * 100 : 0;

  return (
    <>
      <PageHeader title="Platform overview" description="What the platform is doing, and what needs a human." />

      {/* The North Star, stated once and prominently. */}
      <Card className="mb-6 border-l-4 border-jade-600">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">North Star metric</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{formatKes(platform.workerIncomeTotal)}</p>
        <p className="mt-1 text-sm text-secondary">
          Total income generated for workers. Computed from released payments in the ledger, not from
          analytics events — this is money that actually moved.
        </p>
      </Card>

      {moderationQueue + n(q?.open_disputes) + n(q?.open_fraud) + n(q?.pending_verifications) > 0 ? (
        <section className="mb-8">
          <SectionHeading title="Needs a human" />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Postings held', value: moderationQueue, href: '/admin/moderation' },
              { label: 'Open disputes', value: n(q?.open_disputes), href: '/admin/disputes' },
              { label: 'Fraud flags', value: n(q?.open_fraud), href: '/admin/fraud' },
              { label: 'Verifications', value: n(q?.pending_verifications), href: '/admin/verifications' },
            ]
              .filter((item) => item.value > 0)
              .map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="card card-interactive block p-4">
                    <p className="text-xs uppercase tracking-wide text-muted">{item.label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-ochre-600 dark:text-ochre-300">{item.value}</p>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ) : (
        <div className="mb-8">
          <Alert tone="success">Nothing waiting on review. All queues are clear.</Alert>
        </div>
      )}

      <section className="mb-8">
        <SectionHeading title="Worker activation" />
        <Card>
          <p className="text-sm text-secondary">
            The funnel that matters: signing up is not the goal, earning is.
          </p>
          <div className="mt-4 space-y-3">
            {[
              { label: `Registered (${activation.workersTotal})`, value: 100 },
              {
                label: `Completed onboarding (${activation.workersOnboarded})`,
                value: activation.workersTotal ? (activation.workersOnboarded / activation.workersTotal) * 100 : 0,
              },
              {
                label: `Proved a skill (${activation.workersWithSimulation})`,
                value: activation.workersTotal ? (activation.workersWithSimulation / activation.workersTotal) * 100 : 0,
              },
              {
                label: `Applied for work (${activation.workersWhoApplied})`,
                value: activation.workersTotal ? (activation.workersWhoApplied / activation.workersTotal) * 100 : 0,
              },
              {
                label: `Earned money (${activation.workersWhoEarned})`,
                value: activationRate,
              },
            ].map((step) => (
              <ScoreBar key={step.label} value={step.value} label={step.label} />
            ))}
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Activation rate</dt>
              <dd className="text-xl font-bold tabular-nums">{activationRate.toFixed(1)}%</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Median days to first income</dt>
              <dd className="text-xl font-bold tabular-nums">{activation.medianDaysToFirstIncome ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Average worker earnings</dt>
              <dd className="text-xl font-bold tabular-nums">{formatKes(activation.averageWorkerEarnings)}</dd>
            </div>
          </dl>
        </Card>
      </section>

      <section className="mb-8">
        <SectionHeading title="Marketplace" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Workers" value={platform.registeredWorkers} hint={`${platform.activeWorkers30d} active in 30 days`} />
          <Stat label="Employers" value={platform.registeredEmployers} hint={`${platform.activeEmployers30d} posted in 30 days`} />
          <Stat label="Open jobs" value={platform.openJobs} />
          <Stat label="Open tasks" value={platform.openTasks} />
          <Stat label="Applications" value={platform.totalApplications} />
          <Stat label="Placements" value={platform.totalPlacements} />
          <Stat label="Tasks completed" value={platform.completedAssignments} />
          <Stat label="Employer repeat rate" value={`${repeat.rate}%`} hint={`${repeat.repeat} of ${repeat.total}`} />
        </div>
      </section>

      <section>
        <SectionHeading title="Money" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Paid to workers" value={formatKes(platform.workerIncomeTotal)} tone="jade" />
          <Stat label="Platform revenue" value={formatKes(platform.platformRevenueTotal)} />
          <Stat label="Held in escrow" value={formatKes(platform.escrowHeldTotal)} hint="Committed to active work" />
        </div>
      </section>
    </>
  );
}
