import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireEmployer } from '@/lib/domain/employers';
import { listJobs } from '@/lib/domain/opportunities';
import { timeAgo } from '@/lib/i18n';
import { Badge, EmptyState, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Your jobs' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  CLOSED: 'neutral',
  FILLED: 'success',
  REJECTED: 'danger',
};

export default async function EmployerJobsPage() {
  const auth = await requireAuth(['EMPLOYER']);
  const employer = await requireEmployer(auth.user.id);
  const { items } = await listJobs({ companyId: employer.companyId, includeUnpublished: true }, { limit: 50, offset: 0 });

  return (
    <>
      <PageHeader
        title="Your jobs"
        action={
          <Link href="/employer/jobs/new" className="btn btn-primary">
            Post a job
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon="briefcase"
          title="You have not posted a job yet."
          description="Describe the role in your own words and we will draft a complete posting for you to review."
          actionLabel="Post a job"
          actionHref="/employer/jobs/new"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((job) => (
            <li key={job.id}>
              <Link href={`/employer/jobs/${job.id}`} className="card card-interactive flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{job.title}</p>
                  <p className="text-sm text-muted">
                    {job.region_name ?? 'Kenya'} · {job.employment_type.replace(/_/g, ' ').toLowerCase()}
                    {job.published_at ? ` · posted ${timeAgo(job.published_at)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="text-sm text-muted">
                    {job.application_count} applicant{job.application_count === 1 ? '' : 's'}
                  </span>
                  <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{job.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
