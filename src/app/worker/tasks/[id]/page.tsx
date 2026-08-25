import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { buildMatchProfile, requireWorkerProfile } from '@/lib/domain/workers';
import { getTask, recordTaskView, taskRequirements } from '@/lib/domain/opportunities';
import { computeMatch } from '@/lib/matching';
import { sql } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';
import { formatKes } from '@/lib/i18n';
import { Alert, Card, MatchBadge, PageHeader, ScoreBar, VerificationBadge } from '@/components/ui';
import { TaskApplyPanel } from './apply-panel';

export const metadata: Metadata = { title: 'Task details' };
export const dynamic = 'force-dynamic';

export default async function WorkerTaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const task = await getTask(id);
  if (!task || task.status !== 'PUBLISHED') notFound();

  void recordTaskView(task.id);

  const [matchProfile, applied] = await Promise.all([
    buildMatchProfile(profile.id),
    sql<{ id: string; status: string }[]>`
      SELECT id, status::text FROM task_applications WHERE task_id = ${task.id} AND worker_profile_id = ${profile.id}
    `,
  ]);

  const match = computeMatch(matchProfile, taskRequirements(task));
  const budget = Number(task.budget_amount);
  const feeBps = getEnv().PLATFORM_FEE_BPS;
  const net = budget - Math.round((budget * feeBps) / 10_000);

  return (
    <>
      <PageHeader title={task.title} description={`${task.company_name} · ${task.category}`} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap gap-2">
              <VerificationBadge tier={task.verification_tier} />
              {task.requires_laptop ? <span className="badge border surface-sunken">Laptop required</span> : null}
              <span className="badge border surface-sunken">{task.requires_location ? task.region_name ?? 'On-site' : 'Remote'}</span>
              {task.workers_needed > 1 ? (
                <span className="badge border surface-sunken">
                  {task.workers_assigned}/{task.workers_needed} workers assigned
                </span>
              ) : null}
            </div>

            <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">{task.description}</div>

            <div className="mt-5">
              <h2 className="font-semibold">What you must deliver</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{task.expected_output}</p>
            </div>

            {task.quality_requirements ? (
              <div className="mt-5">
                <h2 className="font-semibold">Quality requirements</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{task.quality_requirements}</p>
              </div>
            ) : null}

            {(task.required_skills ?? []).length > 0 ? (
              <div className="mt-5">
                <h2 className="font-semibold">Skills required</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(task.required_skills ?? []).map((slug) => (
                    <span key={slug} className="badge border surface-sunken">
                      {slug.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Alert tone="info" title="How you get paid">
            When the employer accepts you, {formatKes(budget)} is locked in escrow before you start
            work. Once your submission is approved, {formatKes(net)} is released to your balance. The
            difference is the KaziOS platform fee — shown here, before you commit, not after.
          </Alert>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <p className="text-sm text-muted">Budget</p>
            <p className="text-2xl font-bold tabular-nums">{formatKes(budget)}</p>
            <p className="mt-1 text-sm text-secondary">You receive {formatKes(net)} after the platform fee.</p>

            {task.estimated_hours ? (
              <p className="mt-3 text-sm text-muted">
                Estimated {Number(task.estimated_hours)} hours
                {' · '}
                about {formatKes(Math.round(net / Number(task.estimated_hours)))} per hour
              </p>
            ) : null}

            {task.deadline ? (
              <p className="mt-1 text-sm text-muted">
                Due {new Date(task.deadline).toLocaleDateString('en-KE', { day: 'numeric', month: 'long' })}
              </p>
            ) : null}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Your match</h2>
              <MatchBadge score={match.score} band={match.band} />
            </div>
            <div className="mt-3">
              <ScoreBar value={match.score} />
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {match.reasons.slice(0, 4).map((reason) => (
                <li key={reason.factor} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className={reason.impact === 'POSITIVE' ? 'text-jade-600 dark:text-jade-300' : reason.impact === 'NEGATIVE' ? 'text-red-600' : 'text-muted'}
                  >
                    {reason.impact === 'POSITIVE' ? '+' : reason.impact === 'NEGATIVE' ? '−' : '·'}
                  </span>
                  <span className="text-secondary">{reason.explanation}</span>
                </li>
              ))}
            </ul>
            {match.blockers.length > 0 ? (
              <p className="mt-3 rounded-lg surface-sunken p-2 text-sm">
                <span className="font-semibold">Note: </span>
                {match.blockers[0]} You can still apply.
              </p>
            ) : null}
          </Card>

          <TaskApplyPanel
            taskId={task.id}
            defaultBid={budget}
            existing={applied[0] ? { id: applied[0].id, status: applied[0].status } : null}
          />
        </div>
      </div>
    </>
  );
}
