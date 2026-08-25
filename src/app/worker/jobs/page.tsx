import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { buildMatchProfile, requireWorkerProfile } from '@/lib/domain/workers';
import { recommendJobs } from '@/lib/domain/opportunities';
import { recommendTemplates } from '@/lib/domain/simulations';
import { formatKes } from '@/lib/i18n';
import { EmptyState, MatchBadge, PageHeader, VerificationBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Jobs for you' };
export const dynamic = 'force-dynamic';

function salaryLabel(job: { salary_is_public: boolean; salary_min: string | null; salary_max: string | null; salary_period: string }) {
  if (!job.salary_is_public || (!job.salary_min && !job.salary_max)) return 'Salary not stated';
  const period = job.salary_period.toLowerCase();
  const min = job.salary_min ? formatKes(Number(job.salary_min)) : null;
  const max = job.salary_max ? formatKes(Number(job.salary_max)) : null;
  if (min && max && min !== max) return `${min} – ${max} / ${period}`;
  return `${min ?? max} / ${period}`;
}

export default async function WorkerJobsPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);
  const matchProfile = await buildMatchProfile(profile.id);
  const jobs = await recommendJobs(profile.id, matchProfile, 30);

  if (jobs.length === 0) {
    const suggestions = await recommendTemplates(profile.id, 1);
    const suggestion = suggestions[0];
    return (
      <>
        <PageHeader title="Jobs for you" />
        <EmptyState
          icon="◎"
          title="No jobs match you yet."
          description={
            suggestion
              ? `Complete the "${suggestion.title}" simulation — verified evidence is what makes you visible to employers searching for these skills.`
              : 'Add your skills and complete a work simulation so employers can find you.'
          }
          actionLabel={suggestion ? 'Start that simulation' : 'Add your skills'}
          actionHref={suggestion ? '/worker/simulations' : '/worker/profile'}
        />
        <p className="mt-4 text-center text-sm text-secondary">
          You can also{' '}
          <Link href="/jobs" className="font-semibold text-jade-600 underline dark:text-jade-300">
            browse every open job
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Jobs for you"
        description="Ranked by how well your evidence matches what each employer asked for. Every score shows its reasoning."
        action={
          <Link href="/jobs" className="btn btn-secondary">
            Browse all jobs
          </Link>
        }
      />

      <ul className="space-y-3">
        {jobs.map(({ job, match, alreadyApplied }) => (
          <li key={job.id}>
            <Link href={`/worker/jobs/${job.id}`} className="card block p-4 hover:surface-sunken sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-snug">{job.title}</h2>
                  <p className="mt-0.5 text-sm text-secondary">
                    {job.company_name} · {job.region_name ?? 'Kenya'} ·{' '}
                    {job.work_arrangement.toLowerCase()} · {job.employment_type.replace(/_/g, ' ').toLowerCase()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <MatchBadge score={match.score} band={match.band} />
                  {alreadyApplied ? <span className="text-xs font-semibold text-jade-600 dark:text-jade-300">Applied</span> : null}
                </div>
              </div>

              <p className="mt-2 font-medium tabular-nums">{salaryLabel(job)}</p>

              <div className="mt-2">
                <VerificationBadge tier={job.verification_tier} />
              </div>

              {match.reasons.filter((r) => r.impact === 'POSITIVE').length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-secondary">
                  {match.reasons
                    .filter((r) => r.impact === 'POSITIVE')
                    .slice(0, 2)
                    .map((reason) => (
                      <li key={reason.factor} className="flex gap-2">
                        <span aria-hidden="true" className="text-jade-600 dark:text-jade-300">
                          +
                        </span>
                        {reason.explanation}
                      </li>
                    ))}
                </ul>
              ) : null}

              {match.gaps.length > 0 ? (
                <p className="mt-2 text-sm text-muted">
                  <span className="font-medium">Gap: </span>
                  {match.gaps[0]}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
