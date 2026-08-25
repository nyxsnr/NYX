/**
 * Employer domain service.
 *
 * Every employer action is scoped to their own company. `requireEmployer`
 * returns that scope and is the single place the mapping is established, so no
 * route can accidentally operate across company boundaries.
 */
import 'server-only';
import { sql, type Db } from '@/lib/db/client';
import { forbidden, notFound } from '@/lib/http/errors';

export interface EmployerContext {
  userId: string;
  employerProfileId: string;
  companyId: string;
  companyName: string;
  verificationTier: 'UNVERIFIED' | 'BASIC_VERIFIED' | 'BUSINESS_VERIFIED';
}

export async function requireEmployer(userId: string, db: Db = sql): Promise<EmployerContext> {
  const rows = await db<
    Array<{ id: string; company_id: string | null; name: string | null; verification_tier: EmployerContext['verificationTier'] | null }>
  >`
    SELECT ep.id, ep.company_id, c.name, c.verification_tier
    FROM employer_profiles ep
    LEFT JOIN companies c ON c.id = ep.company_id
    WHERE ep.user_id = ${userId} AND ep.deleted_at IS NULL
  `;
  const row = rows[0];
  if (!row) throw notFound('Employer profile');
  if (!row.company_id) throw forbidden('Complete your company profile before continuing.');

  return {
    userId,
    employerProfileId: row.id,
    companyId: row.company_id,
    companyName: row.name ?? '',
    verificationTier: row.verification_tier ?? 'UNVERIFIED',
  };
}

/** Assert a job belongs to this employer's company. */
export async function assertOwnsJob(companyId: string, jobId: string, db: Db = sql): Promise<void> {
  const rows = await db<{ id: string }[]>`
    SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} AND deleted_at IS NULL
  `;
  if (!rows[0]) throw notFound('Job');
}

export async function assertOwnsTask(companyId: string, taskId: string, db: Db = sql): Promise<void> {
  const rows = await db<{ id: string }[]>`
    SELECT id FROM tasks WHERE id = ${taskId} AND company_id = ${companyId} AND deleted_at IS NULL
  `;
  if (!rows[0]) throw notFound('Task');
}

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  industry: string | null;
  size_bracket: string | null;
  website: string | null;
  logo_url: string | null;
  region_id: string | null;
  region_name: string | null;
  town: string | null;
  verification_tier: EmployerContext['verificationTier'];
  verified_at: Date | null;
  total_spent: string;
  jobs_posted: number;
  tasks_posted: number;
  hires_made: number;
  avg_rating: string | null;
  rating_count: number;
  is_demo: boolean;
}

export async function getCompany(companyId: string, db: Db = sql): Promise<CompanyRow | null> {
  const rows = await db<CompanyRow[]>`
    SELECT c.*, r.name AS region_name
    FROM companies c LEFT JOIN regions r ON r.id = c.region_id
    WHERE c.id = ${companyId} AND c.deleted_at IS NULL
  `;
  return rows[0] ?? null;
}

/**
 * Public company view.
 *
 * Registration number and tax PIN are held for verification review and are
 * never included here — they are exactly the identifiers used to impersonate
 * a business.
 */
export function serializeCompany(company: CompanyRow) {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    description: company.description,
    industry: company.industry,
    sizeBracket: company.size_bracket,
    website: company.website,
    logoUrl: company.logo_url,
    location: [company.town, company.region_name].filter(Boolean).join(', ') || null,
    verificationTier: company.verification_tier,
    verifiedAt: company.verified_at,
    jobsPosted: company.jobs_posted,
    tasksPosted: company.tasks_posted,
    hiresMade: company.hires_made,
    rating: company.rating_count >= 3 && company.avg_rating ? Number(company.avg_rating) : null,
    ratingCount: company.rating_count,
    isDemo: company.is_demo,
  };
}

/** Everything the employer dashboard needs, in one query. */
export async function getEmployerDashboard(companyId: string, userId: string) {
  const rows = await sql<
    Array<{
      active_jobs: string; draft_jobs: string; active_tasks: string;
      new_applicants: string; shortlisted: string; active_workers: string;
      pending_review: string; completed_tasks: string; total_spent: string;
      escrow_held: string; open_disputes: string;
    }>
  >`
    SELECT
      (SELECT count(*)::text FROM jobs WHERE company_id = ${companyId} AND status = 'PUBLISHED' AND deleted_at IS NULL) AS active_jobs,
      (SELECT count(*)::text FROM jobs WHERE company_id = ${companyId} AND status = 'DRAFT' AND deleted_at IS NULL) AS draft_jobs,
      (SELECT count(*)::text FROM tasks WHERE company_id = ${companyId}
         AND status IN ('PUBLISHED','ASSIGNED','IN_PROGRESS','SUBMITTED') AND deleted_at IS NULL) AS active_tasks,
      (SELECT count(*)::text FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE j.company_id = ${companyId} AND a.status = 'SUBMITTED') AS new_applicants,
      (SELECT count(*)::text FROM applications a JOIN jobs j ON j.id = a.job_id
         WHERE j.company_id = ${companyId} AND a.status = 'SHORTLISTED') AS shortlisted,
      (SELECT count(*)::text FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
         WHERE t.company_id = ${companyId} AND ta.status = 'ACTIVE') AS active_workers,
      (SELECT count(*)::text FROM work_submissions ws JOIN tasks t ON t.id = ws.task_id
         WHERE t.company_id = ${companyId} AND ws.status = 'SUBMITTED') AS pending_review,
      (SELECT count(*)::text FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
         WHERE t.company_id = ${companyId} AND ta.status = 'APPROVED') AS completed_tasks,
      (SELECT coalesce(sum(gross_amount), 0)::text FROM payments
         WHERE payer_company_id = ${companyId} AND status = 'RELEASED') AS total_spent,
      (SELECT coalesce(sum(gross_amount), 0)::text FROM payments
         WHERE payer_company_id = ${companyId} AND status = 'HELD_IN_ESCROW') AS escrow_held,
      (SELECT count(*)::text FROM disputes d
         WHERE d.against_user_id = ${userId} AND d.status IN ('OPEN','UNDER_REVIEW')) AS open_disputes
  `;

  const r = rows[0];
  const n = (v: string | undefined) => Number(v ?? 0);

  return {
    activeJobs: n(r?.active_jobs),
    draftJobs: n(r?.draft_jobs),
    activeTasks: n(r?.active_tasks),
    newApplicants: n(r?.new_applicants),
    shortlisted: n(r?.shortlisted),
    activeWorkers: n(r?.active_workers),
    pendingReview: n(r?.pending_review),
    completedTasks: n(r?.completed_tasks),
    totalSpent: n(r?.total_spent),
    escrowHeld: n(r?.escrow_held),
    openDisputes: n(r?.open_disputes),
  };
}
