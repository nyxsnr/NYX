import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireEmployer } from '@/lib/domain/employers';
import { sql } from '@/lib/db/client';
import { formatKes, timeAgo } from '@/lib/i18n';
import { Badge, EmptyState, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Projects' };
export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const auth = await requireAuth(['EMPLOYER']);
  const employer = await requireEmployer(auth.user.id);

  const projects = await sql<
    Array<{ id: string; title: string; status: string; total_budget: string | null; created_at: Date; task_count: string }>
  >`
    SELECT p.id, p.title, p.status, p.total_budget, p.created_at,
           (SELECT count(*)::text FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS task_count
    FROM projects p
    WHERE p.company_id = ${employer.companyId} AND p.deleted_at IS NULL
    ORDER BY p.created_at DESC
  `;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Describe an outcome in plain language and we will break it into scoped, priced tasks for your approval."
        action={
          <Link href="/employer/projects/new" className="btn btn-primary">
            Describe a project
          </Link>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon="folder"
          title="No projects yet."
          description={'Try: "I need my restaurant\'s social media managed" or "Clean up our customer database". We will propose the tasks, and nothing is published until you approve it.'}
          actionLabel="Describe a project"
          actionHref="/employer/projects/new"
        />
      ) : (
        <ul className="space-y-2">
          {projects.map((project) => (
            <li key={project.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{project.title}</p>
                <p className="text-sm text-muted">
                  {project.task_count} task{project.task_count === '1' ? '' : 's'} · created {timeAgo(project.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {project.total_budget ? <span className="font-semibold tabular-nums">{formatKes(Number(project.total_budget))}</span> : null}
                <Badge tone={project.status === 'ACTIVE' ? 'success' : project.status === 'PROPOSED' ? 'warning' : 'neutral'}>
                  {project.status.toLowerCase()}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
