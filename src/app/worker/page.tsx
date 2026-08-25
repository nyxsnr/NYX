import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { buildMatchProfile, getReadiness, requireWorkerProfile } from '@/lib/domain/workers';
import { recommendJobs, recommendTasks } from '@/lib/domain/opportunities';
import { recommendTemplates } from '@/lib/domain/simulations';
import { getWalletSummary } from '@/lib/payments/service';
import { sql } from '@/lib/db/client';
import { formatKes } from '@/lib/i18n';
import { Alert, Card, EmptyState, MatchBadge, PageHeader, ScoreBar, ScoreRing, SectionHeading, Stat, VerificationBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Your dashboard' };
export const dynamic = 'force-dynamic';

export default async function WorkerDashboard() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  // Onboarding is not optional: matching without a profile produces noise.
  if (!profile.onboarding_completed_at) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title={`Welcome, ${auth.user.fullName.split(' ')[0]}`}
          description="Let's find out what you can do. This takes about ten minutes."
        />
        <Card>
          <p className="text-sm text-secondary">
            We will ask about your background, what you have access to, and the kind of work you want.
            If you are not sure what work you can do, that is fine — say so and we will work it out
            together.
          </p>
          <Link href="/worker/onboarding" className="btn btn-primary mt-5 w-full sm:w-auto">
            Start
          </Link>
        </Card>
      </div>
    );
  }

  const [readiness, matchProfile, wallet, activeWork] = await Promise.all([
    getReadiness(profile.id),
    buildMatchProfile(profile.id),
    getWalletSummary(auth.user.id, 'WORKER'),
    sql<Array<{ id: string; task_title: string; status: string; due_at: Date | null; agreed_amount: string }>>`
      SELECT a.id, t.title AS task_title, a.status, a.due_at, a.agreed_amount
      FROM task_assignments a JOIN tasks t ON t.id = a.task_id
      WHERE a.worker_profile_id = ${profile.id} AND a.status IN ('ACTIVE', 'SUBMITTED')
      ORDER BY a.due_at NULLS LAST
      LIMIT 5
    `,
  ]);

  const [jobs, tasks, simulations] = await Promise.all([
    recommendJobs(profile.id, matchProfile, 4),
    recommendTasks(profile.id, matchProfile, 4),
    recommendTemplates(profile.id, 3),
  ]);

  const topActions = readiness.improvements.slice(0, 3);
  const nothingMatches = jobs.length === 0 && tasks.length === 0;

  return (
    <>
      <PageHeader
        title={`Hello, ${auth.user.fullName.split(' ')[0]}`}
        description="Here is where you stand and what will move you forward fastest."
        action={
          <Link href="/worker/jobs" className="btn btn-primary">
            Find work
          </Link>
        }
      />

      {/* Active work comes first — it is money already in motion. */}
      {activeWork.length > 0 ? (
        <section className="mb-8">
          <SectionHeading title="Work in progress" />
          <ul className="space-y-2">
            {activeWork.map((work) => (
              <li key={work.id}>
                <Link href={`/worker/work/${work.id}`} className="card card-interactive flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{work.task_title}</p>
                    <p className="text-sm text-muted">
                      {work.status === 'SUBMITTED' ? 'Submitted — awaiting review' : 'In progress'}
                      {work.due_at ? ` · due ${new Date(work.due_at).toLocaleDateString('en-KE')}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{formatKes(Number(work.agreed_amount))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Readiness: the transparent score, never a mystery number. */}
      <section className="mb-8">
        <Card>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2 sm:w-40">
              <ScoreRing score={readiness.score} band={readiness.band} />
              <Link href="/worker/readiness" className="text-sm font-semibold text-jade-600 hover:underline dark:text-jade-300">
                How this is worked out
              </Link>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Work readiness</h2>
              <div className="mt-3 space-y-3">
                {readiness.components.slice(0, 4).map((component) => (
                  <ScoreBar key={component.key} value={component.score} label={component.label} />
                ))}
              </div>
            </div>
          </div>

          {topActions.length > 0 ? (
            <div className="mt-6 border-t pt-4">
              <h3 className="text-sm font-semibold">Improve your score</h3>
              <ol className="mt-3 space-y-2">
                {topActions.map((action, index) => (
                  <li key={action.key}>
                    <Link href={action.href} className="flex items-start gap-3 rounded-lg p-2">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-jade-600 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{action.title}</span>
                        <span className="block text-sm text-secondary">{action.description}</span>
                      </span>
                      <span className="ml-auto shrink-0 whitespace-nowrap text-sm font-semibold text-jade-600 dark:text-jade-300">
                        +{action.estimatedPoints} pts
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Card>
      </section>

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Available balance" value={formatKes(wallet.available)} tone="jade" hint="Ready to withdraw" />
        <Stat label="In escrow" value={formatKes(wallet.pending)} hint="Released when work is approved" />
        <Stat label="Earned to date" value={formatKes(wallet.lifetimeEarned)} />
      </section>

      {nothingMatches ? (
        <section className="mb-8">
          <EmptyState
            icon="compass"
            title="No opportunities match you yet."
            description={
              simulations.length > 0
                ? `Complete the "${simulations[0]?.title}" simulation to turn your strongest skill into verified evidence — that is what opens up matches.`
                : 'Add your skills and complete a work simulation so we have something concrete to match on.'
            }
            actionLabel={simulations.length > 0 ? 'Start that simulation' : 'Add your skills'}
            actionHref={simulations.length > 0 ? '/worker/simulations' : '/worker/profile'}
          />
        </section>
      ) : null}

      {jobs.length > 0 ? (
        <section className="mb-8">
          <SectionHeading
            title="Jobs matched to you"
            action={
              <Link href="/worker/jobs" className="text-sm font-semibold text-jade-600 hover:underline dark:text-jade-300">
                View all
              </Link>
            }
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {jobs.map(({ job, match, alreadyApplied }) => (
              <li key={job.id}>
                <Link href={`/worker/jobs/${job.id}`} className="card card-interactive block h-full p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold leading-snug">{job.title}</p>
                    <MatchBadge score={match.score} />
                  </div>
                  <p className="mt-1 text-sm text-secondary">
                    {job.company_name} · {job.region_name ?? 'Kenya'}
                  </p>
                  <div className="mt-2">
                    <VerificationBadge tier={job.verification_tier} />
                  </div>
                  {match.reasons.filter((r) => r.impact === 'POSITIVE')[0] ? (
                    <p className="mt-3 text-sm text-secondary">
                      <span className="font-medium">Why: </span>
                      {match.reasons.filter((r) => r.impact === 'POSITIVE')[0]?.explanation}
                    </p>
                  ) : null}
                  {alreadyApplied ? <p className="mt-2 text-xs font-semibold text-jade-600 dark:text-jade-300">Applied</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tasks.length > 0 ? (
        <section className="mb-8">
          <SectionHeading
            title="Paid tasks matched to you"
            action={
              <Link href="/worker/tasks" className="text-sm font-semibold text-jade-600 hover:underline dark:text-jade-300">
                View all
              </Link>
            }
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {tasks.map(({ task, match }) => (
              <li key={task.id}>
                <Link href={`/worker/tasks/${task.id}`} className="card card-interactive block h-full p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold leading-snug">{task.title}</p>
                    <MatchBadge score={match.score} />
                  </div>
                  <p className="mt-1 text-sm text-secondary">{task.company_name}</p>
                  <p className="mt-2 text-lg font-bold tabular-nums">{formatKes(Number(task.budget_amount))}</p>
                  {task.requires_laptop ? <p className="mt-1 text-xs text-muted">Requires a laptop</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!auth.user.emailVerifiedAt ? (
        <Alert tone="warning" title="Verify your email address">
          Verified accounts are trusted more by employers, and verification is required before you can
          be paid.{' '}
          <Link href="/worker/profile" className="font-semibold underline">
            Verify now
          </Link>
        </Alert>
      ) : null}
    </>
  );
}
