import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { requireEmployer } from '@/lib/domain/employers';

export const GET = route({ auth: 'required', roles: ['EMPLOYER'] }, async (ctx) => {
  const employer = await requireEmployer(ctx.auth.user.id);
  const rows = await sql<
    Array<{ id: string; title: string; brief: string; status: string; total_budget: string | null; created_at: Date; task_count: string }>
  >`
    SELECT p.id, p.title, p.brief, p.status, p.total_budget, p.created_at,
           (SELECT count(*)::text FROM tasks t WHERE t.project_id = p.id AND t.deleted_at IS NULL) AS task_count
    FROM projects p
    WHERE p.company_id = ${employer.companyId} AND p.deleted_at IS NULL
    ORDER BY p.created_at DESC
  `;
  return ok(rows.map((r) => ({ ...r, totalBudget: r.total_budget ? Number(r.total_budget) : null, taskCount: Number(r.task_count) })));
});
