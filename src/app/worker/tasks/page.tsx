import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { buildMatchProfile, requireWorkerProfile } from '@/lib/domain/workers';
import { recommendTasks } from '@/lib/domain/opportunities';
import { recommendTemplates } from '@/lib/domain/simulations';
import { formatKes } from '@/lib/i18n';
import { EmptyState, MatchBadge, PageHeader, VerificationBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Tasks for you' };
export const dynamic = 'force-dynamic';

export default async function WorkerTasksPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);
  const matchProfile = await buildMatchProfile(profile.id);
  const tasks = await recommendTasks(profile.id, matchProfile, 30);

  if (tasks.length === 0) {
    const suggestions = await recommendTemplates(profile.id, 1);
    const suggestion = suggestions[0];
    return (
      <>
        <PageHeader title="Tasks for you" />
        <EmptyState
          icon="⚡"
          title="No tasks match you yet."
          description={
            suggestion
              ? `Task work is the fastest route to your first income on KaziOS. Complete the "${suggestion.title}" simulation to unlock matching tasks.`
              : 'Add your skills so we can match you to paid task work.'
          }
          actionLabel={suggestion ? 'Start that simulation' : 'Add your skills'}
          actionHref={suggestion ? '/worker/simulations' : '/worker/profile'}
        />
        <p className="mt-4 text-center text-sm text-secondary">
          You can also{' '}
          <Link href="/tasks" className="font-semibold text-jade-600 underline dark:text-jade-300">
            browse every open task
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Tasks for you"
        description="Paid work you can complete without a permanent job. Payment is held in escrow before you start."
        action={
          <Link href="/tasks" className="btn btn-secondary">
            Browse all tasks
          </Link>
        }
      />

      <ul className="space-y-3">
        {tasks.map(({ task, match, alreadyApplied }) => (
          <li key={task.id}>
            <Link href={`/worker/tasks/${task.id}`} className="card block p-4 hover:surface-sunken sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
                  <p className="mt-0.5 text-sm text-secondary">
                    {task.company_name} · {task.category}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <MatchBadge score={match.score} band={match.band} />
                  {alreadyApplied ? <span className="text-xs font-semibold text-jade-600 dark:text-jade-300">Applied</span> : null}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="text-xl font-bold tabular-nums">{formatKes(Number(task.budget_amount))}</span>
                {task.estimated_hours ? (
                  <span className="text-sm text-muted">about {Number(task.estimated_hours)} hours</span>
                ) : null}
                {task.deadline ? (
                  <span className="text-sm text-muted">
                    due {new Date(task.deadline).toLocaleDateString('en-KE')}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <VerificationBadge tier={task.verification_tier} />
                {task.requires_laptop ? <span className="badge border surface-sunken">Laptop required</span> : null}
                {task.requires_location ? (
                  <span className="badge border surface-sunken">{task.region_name ?? 'On-site'}</span>
                ) : (
                  <span className="badge border surface-sunken">Remote</span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
