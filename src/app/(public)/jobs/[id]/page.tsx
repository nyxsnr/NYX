import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getJob } from '@/lib/domain/opportunities';
import { getAuthContext } from '@/lib/auth/session';
import { formatKes } from '@/lib/i18n';
import { Alert, Card, PageHeader, VerificationBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(id).catch(() => null);
  if (!job) return { title: 'Job not found' };
  return {
    title: `${job.title} at ${job.company_name}`,
    description: job.description.slice(0, 160),
  };
}

export default async function PublicJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job || job.status !== 'PUBLISHED') notFound();

  const auth = await getAuthContext().catch(() => null);

  // A signed-in worker gets the version with their explained match.
  if (auth?.user.role === 'WORKER') {
    return (
      <Card>
        <p className="text-sm">Opening this job with your match details…</p>
        <Link href={`/worker/jobs/${job.id}`} className="btn btn-primary mt-3">
          Continue
        </Link>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={job.title} description={`${job.company_name} · ${job.region_name ?? 'Kenya'}`} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="flex flex-wrap gap-2">
            <VerificationBadge tier={job.verification_tier} />
            <span className="badge border surface-sunken">{job.employment_type.replace(/_/g, ' ').toLowerCase()}</span>
            <span className="badge border surface-sunken">{job.work_arrangement.toLowerCase()}</span>
          </div>

          <p className="mt-4 text-lg font-semibold tabular-nums">
            {job.salary_is_public && (job.salary_min || job.salary_max)
              ? `${job.salary_min ? formatKes(Number(job.salary_min)) : ''}${job.salary_max && job.salary_min ? ' – ' : ''}${job.salary_max ? formatKes(Number(job.salary_max)) : ''} / ${job.salary_period.toLowerCase()}`
              : 'Salary not stated'}
          </p>

          <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">{job.description}</div>

          {job.responsibilities ? (
            <div className="mt-5">
              <h2 className="font-semibold">Responsibilities</h2>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{job.responsibilities}</div>
            </div>
          ) : null}

          {(job.required_skills ?? []).length > 0 ? (
            <div className="mt-5">
              <h2 className="font-semibold">Skills required</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {(job.required_skills ?? []).map((slug) => (
                  <span key={slug} className="badge border surface-sunken">
                    {slug.replace(/-/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <h2 className="font-semibold">Apply for this role</h2>
            <p className="mt-1 text-sm text-secondary">
              Create a free account to apply and to see how well your evidence matches what this
              employer asked for.
            </p>
            <Link href={`/signup?role=worker&next=${encodeURIComponent(`/worker/jobs/${job.id}`)}`} className="btn btn-primary mt-4 w-full">
              Create free account
            </Link>
            <Link href={`/login?next=${encodeURIComponent(`/worker/jobs/${job.id}`)}`} className="btn btn-secondary mt-2 w-full">
              Sign in
            </Link>
            <p className="mt-3 text-xs text-muted">Applying is free. It always will be.</p>
          </Card>

          {job.verification_tier === 'UNVERIFIED' ? (
            <Alert tone="warning" title="Unverified employer">
              No legitimate employer asks you to pay a fee, send your ID, or move off-platform before
              you are hired.
            </Alert>
          ) : null}
        </div>
      </div>
    </>
  );
}
