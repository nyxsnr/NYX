import Link from 'next/link';
import type { Metadata } from 'next';
import { listTasks } from '@/lib/domain/opportunities';
import { sql } from '@/lib/db/client';
import { formatKes, timeAgo } from '@/lib/i18n';
import { EmptyState, PageHeader, VerificationBadge } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Browse paid tasks',
  description: 'Paid task work you can complete remotely. Payment held in escrow before you start.',
};
export const revalidate = 60;

const PAGE_SIZE = 20;

export default async function PublicTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [{ items, total }, categories] = await Promise.all([
    listTasks({ query: params.q, category: params.category }, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    sql<Array<{ category: string; count: string }>>`
      SELECT category, count(*)::text AS count FROM tasks
      WHERE status = 'PUBLISHED' AND deleted_at IS NULL
      GROUP BY category ORDER BY count(*) DESC LIMIT 12
    `,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Paid tasks"
        description={`${total.toLocaleString()} open ${total === 1 ? 'task' : 'tasks'}. Specific pieces of work, paid on approval, with the money held in escrow before you start.`}
      />

      <form method="GET" className="card mb-6 grid gap-3 p-4 sm:grid-cols-[2fr_1fr_auto]">
        <div>
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" className="input" placeholder="Search tasks" defaultValue={params.q ?? ''} />
        </div>
        <div>
          <label className="sr-only" htmlFor="category">
            Category
          </label>
          <select id="category" name="category" className="select" defaultValue={params.category ?? ''}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.category} value={category.category}>
                {category.category} ({category.count})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon="⚡"
          title="No tasks match that search."
          description="Create a free account and we will match you to task work as employers post it."
          actionLabel="Create a free account"
          actionHref="/signup?role=worker"
        />
      ) : (
        <ul className="space-y-3">
          {items.map((task) => (
            <li key={task.id}>
              <Link href={`/tasks/${task.id}`} className="card block p-4 hover:surface-sunken sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
                    <p className="mt-0.5 text-sm text-secondary">
                      {task.company_name} · {task.category}
                    </p>
                  </div>
                  <span className="text-xl font-bold tabular-nums">{formatKes(Number(task.budget_amount))}</span>
                </div>

                <p className="mt-2 line-clamp-2 text-sm text-secondary">{task.description}</p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <VerificationBadge tier={task.verification_tier} />
                  <span className="badge border surface-sunken">{task.requires_location ? task.region_name ?? 'On-site' : 'Remote'}</span>
                  {task.requires_laptop ? <span className="badge border surface-sunken">Laptop required</span> : null}
                </div>

                <p className="mt-2 text-xs text-muted">
                  {task.published_at ? `Posted ${timeAgo(task.published_at)}` : ''} · {task.application_count} proposal
                  {task.application_count === 1 ? '' : 's'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
          <Link
            href={{ pathname: '/tasks', query: { ...params, page: page - 1 } }}
            className={`btn btn-secondary ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`}
          >
            Previous
          </Link>
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          <Link
            href={{ pathname: '/tasks', query: { ...params, page: page + 1 } }}
            className={`btn btn-secondary ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`}
          >
            Next
          </Link>
        </nav>
      ) : null}
    </>
  );
}
