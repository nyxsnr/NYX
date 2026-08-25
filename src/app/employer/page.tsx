import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { getEmployerDashboard, requireEmployer } from '@/lib/domain/employers';
import { getWalletSummary } from '@/lib/payments/service';
import { sql } from '@/lib/db/client';
import { formatKes, timeAgo } from '@/lib/i18n';
import { Alert, EmptyState, PageHeader, SectionHeading, Stat } from '@/components/ui';

export const metadata: Metadata = { title: 'Employer dashboard' };
export const dynamic = 'force-dynamic';

export default async function EmployerDashboard() {
  const auth = await requireAuth(['EMPLOYER']);

  // A brand-new employer has no company yet; send them through onboarding.
  const employer = await requireEmployer(auth.user.id).catch(() => null);
  if (!employer) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Set up your company" description="A few details and you can start posting." />
        <Link href="/employer/onboarding" className="btn btn-primary">
          Continue
        </Link>
      </div>
    );
  }

  const [stats, wallet, applicants, pending] = await Promise.all([
    getEmployerDashboard(employer.companyId, auth.user.id),
    getWalletSummary(auth.user.id, 'EMPLOYER'),
    sql<Array<{ id: string; job_id: string; job_title: string; full_name: string; match_score: number | null; readiness_score: number; created_at: Date; verified_skills: number }>>`
      SELECT a.id, a.job_id, j.title AS job_title, u.full_name, a.match_score,
             wp.readiness_score, a.created_at,
             (SELECT count(*)::int FROM worker_skills ws
               WHERE ws.worker_profile_id = wp.id
                 AND ws.evidence_level IN ('SIMULATION_VERIFIED','EMPLOYER_VERIFIED')) AS verified_skills
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN worker_profiles wp ON wp.id = a.worker_profile_id
      JOIN users u ON u.id = wp.user_id
      WHERE j.company_id = ${employer.companyId} AND a.status IN ('SUBMITTED', 'VIEWED')
      ORDER BY a.match_score DESC NULLS LAST, a.created_at DESC
      LIMIT 5
    `,
    sql<Array<{ id: string; assignment_id: string; task_title: string; worker_name: string; submitted_at: Date }>>`
      SELECT ws.id, ws.assignment_id, t.title AS task_title, u.full_name AS worker_name, ws.submitted_at
      FROM work_submissions ws
      JOIN tasks t ON t.id = ws.task_id
      JOIN worker_profiles wp ON wp.id = ws.worker_profile_id
      JOIN users u ON u.id = wp.user_id
      WHERE t.company_id = ${employer.companyId} AND ws.status = 'SUBMITTED'
      ORDER BY ws.submitted_at ASC
      LIMIT 5
    `,
  ]);

  const nothingPosted = stats.activeJobs === 0 && stats.activeTasks === 0 && stats.draftJobs === 0;

  return (
    <>
      <PageHeader
        title={employer.companyName || 'Your dashboard'}
        description="Everything waiting on you, ordered by what is blocking someone else."
        action={
          <div className="flex gap-2">
            <Link href="/employer/jobs/new" className="btn btn-secondary">
              Post a job
            </Link>
            <Link href="/employer/tasks/new" className="btn btn-primary">
              Create a task
            </Link>
          </div>
        }
      />

      {/* Submitted work is first: a worker is waiting to be paid. */}
      {pending.length > 0 ? (
        <section className="mb-8">
          <SectionHeading title={`Work awaiting your review (${pending.length})`} />
          <Alert tone="warning">
            Each of these is a worker waiting on payment. Approving releases their money immediately.
          </Alert>
          <ul className="mt-3 space-y-2">
            {pending.map((item) => (
              <li key={item.id}>
                <Link href={`/employer/work/${item.assignment_id}`} className="card card-interactive flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.task_title}</p>
                    <p className="text-sm text-muted">
                      {item.worker_name} · submitted {timeAgo(item.submitted_at)}
                    </p>
                  </div>
                  <span className="btn btn-primary shrink-0 px-4 text-sm">Review</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active jobs" value={stats.activeJobs} hint={stats.draftJobs > 0 ? `${stats.draftJobs} draft` : undefined} />
        <Stat label="Active tasks" value={stats.activeTasks} />
        <Stat label="New applicants" value={stats.newApplicants} tone={stats.newApplicants > 0 ? 'ochre' : undefined} />
        <Stat label="Workers on task" value={stats.activeWorkers} />
      </section>

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Available balance" value={formatKes(wallet.available)} tone="jade" />
        <Stat label="Committed to escrow" value={formatKes(wallet.escrow)} hint="Locked for active work" />
        <Stat label="Total spent" value={formatKes(stats.totalSpent)} />
      </section>

      {!wallet.paymentsAreLive ? (
        <div className="mb-8">
          <Alert tone="warning" title="Simulated payments">
            This deployment uses a development payment provider. Balances and escrow behave exactly as
            they will in production, but no money actually moves.
          </Alert>
        </div>
      ) : null}

      {nothingPosted ? (
        <EmptyState
          icon="clipboard"
          title="Nothing posted yet."
          description="Post a permanent role, or describe a project in plain language and we will break it into scoped, priced tasks for your approval."
          actionLabel="Describe a project"
          actionHref="/employer/projects/new"
        />
      ) : null}

      {applicants.length > 0 ? (
        <section>
          <SectionHeading
            title="Applicants to review"
            action={
              <Link href="/employer/jobs" className="text-sm font-semibold text-jade-600 hover:underline dark:text-jade-300">
                All jobs
              </Link>
            }
          />
          <ul className="space-y-2">
            {applicants.map((applicant) => (
              <li key={applicant.id}>
                <Link href={`/employer/jobs/${applicant.job_id}`} className="card card-interactive flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{applicant.full_name}</p>
                    <p className="text-sm text-muted">
                      {applicant.job_title} · applied {timeAgo(applicant.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-sm">
                    <span className="text-muted">
                      {applicant.verified_skills} verified skill{applicant.verified_skills === 1 ? '' : 's'}
                    </span>
                    {applicant.match_score !== null ? (
                      <span className="font-semibold tabular-nums">{applicant.match_score}% match</span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
