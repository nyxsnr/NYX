import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { listWorkerApplications, listWorkerTaskApplications } from '@/lib/domain/applications';
import { formatKes, timeAgo } from '@/lib/i18n';
import { Badge, EmptyState, PageHeader, SectionHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Your applications' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = {
  SUBMITTED: 'neutral',
  VIEWED: 'info',
  SHORTLISTED: 'success',
  INTERVIEWING: 'success',
  OFFERED: 'success',
  HIRED: 'success',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

export default async function ApplicationsPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);
  const page = { limit: 50, offset: 0 };

  const [jobs, tasks] = await Promise.all([
    listWorkerApplications(profile.id, page),
    listWorkerTaskApplications(profile.id, page),
  ]);

  if (jobs.items.length === 0 && tasks.items.length === 0) {
    return (
      <>
        <PageHeader title="Your applications" />
        <EmptyState
          icon="document"
          title="You have not applied to anything yet."
          description="Apply where your match score is 60 or above and you can evidence the core requirement. Five targeted applications beat fifty generic ones."
          actionLabel="See jobs matched to you"
          actionHref="/worker/jobs"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Your applications" description="Every application you have sent, and where it stands." />

      {tasks.items.length > 0 ? (
        <section className="mb-8">
          <SectionHeading title="Task proposals" />
          <ul className="space-y-2">
            {tasks.items.map((application) => (
              <li key={application.id}>
                <Link
                  href={application.assignment_id ? `/worker/work/${application.assignment_id}` : `/worker/tasks/${application.task_id}`}
                  className="card card-interactive flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{application.task_title}</p>
                    <p className="text-sm text-muted">
                      {application.company_name} · sent {timeAgo(application.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold tabular-nums">{formatKes(Number(application.budget_amount))}</span>
                    <Badge tone={STATUS_TONE[application.status] ?? 'neutral'}>{application.status.toLowerCase()}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {jobs.items.length > 0 ? (
        <section>
          <SectionHeading title="Job applications" />
          <ul className="space-y-2">
            {jobs.items.map((application) => (
              <li key={application.id}>
                <Link href={`/worker/jobs/${application.job_id}`} className="card card-interactive flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{application.job_title}</p>
                    <p className="text-sm text-muted">
                      {application.company_name} · sent {timeAgo(application.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {application.match_score !== null ? (
                      <span className="text-sm text-muted tabular-nums">{application.match_score}% match</span>
                    ) : null}
                    <Badge tone={STATUS_TONE[application.status] ?? 'neutral'}>{application.status.toLowerCase()}</Badge>
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
