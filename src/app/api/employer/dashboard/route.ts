import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { getEmployerDashboard, requireEmployer } from '@/lib/domain/employers';
import { getWalletSummary } from '@/lib/payments/service';

export const GET = route({ auth: 'required', roles: ['EMPLOYER'] }, async (ctx) => {
  const employer = await requireEmployer(ctx.auth.user.id);

  const [stats, wallet, recentApplicants, pendingWork] = await Promise.all([
    getEmployerDashboard(employer.companyId, ctx.auth.user.id),
    getWalletSummary(ctx.auth.user.id, 'EMPLOYER'),
    sql<
      Array<{ id: string; job_id: string; job_title: string; full_name: string; match_score: number | null; readiness_score: number; created_at: Date }>
    >`
      SELECT a.id, a.job_id, j.title AS job_title, u.full_name, a.match_score,
             wp.readiness_score, a.created_at
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN worker_profiles wp ON wp.id = a.worker_profile_id
      JOIN users u ON u.id = wp.user_id
      WHERE j.company_id = ${employer.companyId} AND a.status = 'SUBMITTED'
      ORDER BY a.match_score DESC NULLS LAST, a.created_at DESC
      LIMIT 5
    `,
    sql<Array<{ id: string; task_title: string; worker_name: string; submitted_at: Date; assignment_id: string }>>`
      SELECT ws.id, t.title AS task_title, u.full_name AS worker_name, ws.submitted_at, ws.assignment_id
      FROM work_submissions ws
      JOIN tasks t ON t.id = ws.task_id
      JOIN worker_profiles wp ON wp.id = ws.worker_profile_id
      JOIN users u ON u.id = wp.user_id
      WHERE t.company_id = ${employer.companyId} AND ws.status = 'SUBMITTED'
      ORDER BY ws.submitted_at ASC
      LIMIT 5
    `,
  ]);

  return ok({
    company: { id: employer.companyId, name: employer.companyName, verificationTier: employer.verificationTier },
    stats,
    wallet,
    recentApplicants: recentApplicants.map((a) => ({
      applicationId: a.id,
      jobId: a.job_id,
      jobTitle: a.job_title,
      workerName: a.full_name,
      matchScore: a.match_score,
      readinessScore: a.readiness_score,
      appliedAt: a.created_at,
    })),
    // Ordered oldest-first: a worker waiting on approval is waiting on money.
    pendingReview: pendingWork.map((w) => ({
      submissionId: w.id,
      assignmentId: w.assignment_id,
      taskTitle: w.task_title,
      workerName: w.worker_name,
      submittedAt: w.submitted_at,
    })),
  });
});
