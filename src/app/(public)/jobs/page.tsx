import Link from 'next/link';
import type { Metadata } from 'next';
import { listJobs } from '@/lib/domain/opportunities';
import { sql } from '@/lib/db/client';
import { formatKes, timeAgo } from '@/lib/i18n';
import { EmptyState, PageHeader, VerificationBadge } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Browse jobs in Kenya',
  description: 'Open jobs across all 47 counties. Free to apply, always.',
};
export const revalidate = 60;

const PAGE_SIZE = 20;

export default async function PublicJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; regionId?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [{ items, total }, regions, categories] = await Promise.all([
    listJobs(
      { query: params.q, category: params.category, regionId: params.regionId },
      { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    ),
    sql<Array<{ id: string; name: string }>>`SELECT id, name FROM regions WHERE country_code = 'KE' ORDER BY name`,
    sql<Array<{ category: string; count: string }>>`
      SELECT category, count(*)::text AS count FROM jobs
      WHERE status = 'PUBLISHED' AND deleted_at IS NULL
      GROUP BY category ORDER BY count(*) DESC LIMIT 12
    `,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Jobs in Kenya"
        description={`${total.toLocaleString()} open ${total === 1 ? 'role' : 'roles'}. Sign in to see how well each one matches your evidence.`}
      />

      {/* A plain GET form: works without JavaScript, which matters on slow
          connections and low-end browsers. */}
      <form method="GET" className="card mb-6 grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <div>
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" className="input" placeholder="Search job titles and descriptions" defaultValue={params.q ?? ''} />
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
        <div>
          <label className="sr-only" htmlFor="regionId">
            County
          </label>
          <select id="regionId" name="regionId" className="select" defaultValue={params.regionId ?? ''}>
            <option value="">All counties</option>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
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
          icon="🔍"
          title="No jobs match that search."
          description="Try a broader search, or create a free account and we will match you to work as employers post it."
          actionLabel="Create a free account"
          actionHref="/signup?role=worker"
        />
      ) : (
        <ul className="space-y-3">
          {items.map((job) => (
            <li key={job.id}>
              <Link href={`/jobs/${job.id}`} className="card block p-4 hover:surface-sunken sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-snug">{job.title}</h2>
                    <p className="mt-0.5 text-sm text-secondary">
                      {job.company_name} · {job.region_name ?? 'Kenya'} · {job.work_arrangement.toLowerCase()}
                    </p>
                  </div>
                  <VerificationBadge tier={job.verification_tier} />
                </div>

                <p className="mt-2 font-medium tabular-nums">
                  {job.salary_is_public && (job.salary_min || job.salary_max)
                    ? `${job.salary_min ? formatKes(Number(job.salary_min)) : ''}${job.salary_max && job.salary_min ? ' – ' : ''}${job.salary_max ? formatKes(Number(job.salary_max)) : ''} / ${job.salary_period.toLowerCase()}`
                    : 'Salary not stated'}
                </p>

                <p className="mt-2 line-clamp-2 text-sm text-secondary">{job.description}</p>

                <p className="mt-2 text-xs text-muted">
                  {job.published_at ? `Posted ${timeAgo(job.published_at)}` : ''} · {job.application_count} applicant
                  {job.application_count === 1 ? '' : 's'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
          <Link
            href={{ pathname: '/jobs', query: { ...params, page: page - 1 } }}
            className={`btn btn-secondary ${page <= 1 ? 'pointer-events-none opacity-50' : ''}`}
            aria-disabled={page <= 1}
          >
            Previous
          </Link>
          <span className="text-sm text-muted">
            Page {page} of {totalPages}
          </span>
          <Link
            href={{ pathname: '/jobs', query: { ...params, page: page + 1 } }}
            className={`btn btn-secondary ${page >= totalPages ? 'pointer-events-none opacity-50' : ''}`}
            aria-disabled={page >= totalPages}
          >
            Next
          </Link>
        </nav>
      ) : null}
    </>
  );
}
