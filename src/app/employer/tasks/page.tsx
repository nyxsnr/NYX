import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireEmployer } from '@/lib/domain/employers';
import { listTasks } from '@/lib/domain/opportunities';
import { formatKes, timeAgo } from '@/lib/i18n';
import { Badge, EmptyState, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Your tasks' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'danger' | 'info'> = {
  PUBLISHED: 'success',
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  SUBMITTED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  DISPUTED: 'danger',
};

export default async function EmployerTasksPage() {
  const auth = await requireAuth(['EMPLOYER']);
  const employer = await requireEmployer(auth.user.id);
  const { items } = await listTasks({ companyId: employer.companyId, includeUnpublished: true }, { limit: 50, offset: 0 });

  return (
    <>
      <PageHeader
        title="Your tasks"
        action={
          <div className="flex gap-2">
            <Link href="/employer/projects/new" className="btn btn-secondary">
              Describe a project
            </Link>
            <Link href="/employer/tasks/new" className="btn btn-primary">
              Create a task
            </Link>
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon="bolt"
          title="No tasks yet."
          description="A task is a specific piece of work with a defined output — no headcount required. Describe a whole project and we will break it into tasks for you."
          actionLabel="Describe a project"
          actionHref="/employer/projects/new"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((task) => (
            <li key={task.id}>
              <Link href={`/employer/tasks/${task.id}`} className="card card-interactive flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{task.title}</p>
                  <p className="text-sm text-muted">
                    {task.category} · {task.workers_assigned}/{task.workers_needed} assigned
                    {task.published_at ? ` · posted ${timeAgo(task.published_at)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="font-semibold tabular-nums">{formatKes(Number(task.budget_amount))}</span>
                  <Badge tone={STATUS_TONE[task.status] ?? 'neutral'}>{task.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
