import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { offsetFor, pagination } from '@/lib/validation/common';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { listWorkerApplications, listWorkerTaskApplications } from '@/lib/domain/applications';

/** Everything this worker has applied to, jobs and tasks together. */
export const GET = route({ query: pagination, auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const page = { limit: ctx.query.pageSize, offset: offsetFor(ctx.query) };

  const [jobs, tasks] = await Promise.all([
    listWorkerApplications(profile.id, page),
    listWorkerTaskApplications(profile.id, page),
  ]);

  return ok({
    jobApplications: jobs.items.map((a) => ({
      id: a.id,
      kind: 'JOB' as const,
      status: a.status,
      matchScore: a.match_score,
      appliedAt: a.created_at,
      jobId: a.job_id,
      title: a.job_title,
      company: a.company_name,
    })),
    taskApplications: tasks.items.map((a) => ({
      id: a.id,
      kind: 'TASK' as const,
      status: a.status,
      matchScore: a.match_score,
      appliedAt: a.created_at,
      taskId: a.task_id,
      title: a.task_title,
      company: a.company_name,
      budget: Number(a.budget_amount),
      currency: a.currency,
      assignmentId: a.assignment_id,
    })),
    totals: { jobs: jobs.total, tasks: tasks.total },
  });
});
