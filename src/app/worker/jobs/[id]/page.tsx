import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { buildMatchProfile, requireWorkerProfile } from '@/lib/domain/workers';
import { getJob, jobRequirements, recordJobView } from '@/lib/domain/opportunities';
import { computeMatch } from '@/lib/matching';
import { sql } from '@/lib/db/client';
import { formatKes } from '@/lib/i18n';
import { Card, MatchBadge, PageHeader, ScoreBar, VerificationBadge, Alert } from '@/components/ui';
import { ApplyPanel } from './apply-panel';

export const metadata: Metadata = { title: 'Job details' };
export const dynamic = 'force-dynamic';

export default async function WorkerJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const job = await getJob(id);
  if (!job || job.status !== 'PUBLISHED') notFound();

  void recordJobView(job.id);

  const [matchProfile, applied] = await Promise.all([
    buildMatchProfile(profile.id),
    sql<{ id: string; status: string }[]>`
      SELECT id, status::text FROM applications WHERE job_id = ${job.id} AND worker_profile_id = ${profile.id}
    `,
  ]);

  const match = computeMatch(matchProfile, jobRequirements(job));
  const questions = Array.isArray(job.application_questions)
    ? (job.application_questions as Array<{ id: string; prompt: string; required?: boolean }>)
    : [];

  return (
    <>
      <PageHeader title={job.title} description={`${job.company_name} · ${job.region_name ?? 'Kenya'}`} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap gap-2">
              <VerificationBadge tier={job.verification_tier} />
              <span className="badge border surface-sunken">{job.employment_type.replace(/_/g, ' ').toLowerCase()}</span>
              <span className="badge border surface-sunken">{job.work_arrangement.toLowerCase()}</span>
              {job.openings > 1 ? <span className="badge border surface-sunken">{job.openings} openings</span> : null}
            </div>

            <p className="mt-4 text-lg font-semibold tabular-nums">
              {job.salary_is_public && (job.salary_min || job.salary_max)
                ? `${job.salary_min ? formatKes(Number(job.salary_min)) : ''}${job.salary_max && job.salary_min ? ' – ' : ''}${job.salary_max ? formatKes(Number(job.salary_max)) : ''} / ${job.salary_period.toLowerCase()}`
                : 'Salary not stated'}
            </p>

            {job.deadline ? (
              <p className="mt-1 text-sm text-muted">
                Closes {new Date(job.deadline).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            ) : null}

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

            {job.ai_assisted ? (
              <p className="mt-5 text-xs text-muted">This description was drafted with AI assistance by the employer.</p>
            ) : null}
          </Card>

          {job.verification_tier === 'UNVERIFIED' ? (
            <Alert tone="warning" title="This employer is not verified yet">
              Take normal care. No legitimate employer will ask you to pay a fee, send your ID, or move
              the conversation off KaziOS before you are hired.
            </Alert>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {/* The explained match. This is what a job board cannot give you. */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Your match</h2>
              <MatchBadge score={match.score} band={match.band} />
            </div>

            <div className="mt-3">
              <ScoreBar value={match.score} />
            </div>

            <h3 className="mt-4 text-sm font-semibold">Why</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {match.reasons.slice(0, 5).map((reason) => (
                <li key={reason.factor} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className={
                      reason.impact === 'POSITIVE'
                        ? 'text-jade-600 dark:text-jade-300'
                        : reason.impact === 'NEGATIVE'
                          ? 'text-red-600'
                          : 'text-muted'
                    }
                  >
                    {reason.impact === 'POSITIVE' ? '+' : reason.impact === 'NEGATIVE' ? '−' : '·'}
                  </span>
                  <span className="text-secondary">{reason.explanation}</span>
                </li>
              ))}
            </ul>

            {match.gaps.length > 0 ? (
              <>
                <h3 className="mt-4 text-sm font-semibold">What is missing</h3>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary">
                  {match.gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </>
            ) : null}

            <p className="mt-4 text-xs text-muted">
              This score ranks opportunities for you. It is not a decision — you can apply to anything,
              and the employer decides.
            </p>
          </Card>

          <ApplyPanel
            jobId={job.id}
            questions={questions}
            existing={applied[0] ? { id: applied[0].id, status: applied[0].status } : null}
          />
        </div>
      </div>
    </>
  );
}
