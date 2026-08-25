/**
 * Jobs and tasks.
 *
 * Reads are paginated and index-backed — no endpoint here can return an
 * unbounded result set to a phone on mobile data. Recommendation queries
 * pre-filter in SQL to a candidate pool, then rank in memory with the
 * explainable matcher, because the explanation matters as much as the order.
 */
import 'server-only';
import { sql, type Db } from '@/lib/db/client';
import { notFound } from '@/lib/http/errors';
import {
  computeMatch,
  type MatchResult,
  type OpportunityRequirements,
  type SkillLevel,
  type WorkerMatchProfile,
} from '@/lib/matching';
import { contentHash, hashingEmbed, opportunityEmbeddingText } from '@/lib/ai/embeddings';

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface JobRow {
  id: string;
  company_id: string;
  company_name: string;
  company_logo: string | null;
  verification_tier: 'UNVERIFIED' | 'BASIC_VERIFIED' | 'BUSINESS_VERIFIED';
  posted_by: string;
  title: string;
  slug: string;
  description: string;
  responsibilities: string | null;
  category: string;
  region_id: string | null;
  region_name: string | null;
  town: string | null;
  work_arrangement: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY';
  employment_type: string;
  salary_min: string | null;
  salary_max: string | null;
  salary_period: string;
  currency: string;
  salary_is_public: boolean;
  min_education: string | null;
  min_years_experience: number;
  languages_required: string[];
  openings: number;
  deadline: Date | null;
  application_questions: unknown;
  status: string;
  published_at: Date | null;
  ai_assisted: boolean;
  view_count: number;
  application_count: number;
  moderation_notes: string | null;
  is_demo: boolean;
  created_at: Date;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
}

const JOB_SELECT = sql`
  SELECT j.*, c.name AS company_name, c.logo_url AS company_logo, c.verification_tier,
         r.name AS region_name,
         -- Window count so a paginated list returns its total in one round trip.
         count(*) OVER ()::text AS total,
         (SELECT array_agg(s.slug) FROM job_skills js JOIN skills s ON s.id = js.skill_id
           WHERE js.job_id = j.id AND js.is_required) AS required_skills,
         (SELECT array_agg(s.slug) FROM job_skills js JOIN skills s ON s.id = js.skill_id
           WHERE js.job_id = j.id AND NOT js.is_required) AS preferred_skills
  FROM jobs j
  JOIN companies c ON c.id = j.company_id
  LEFT JOIN regions r ON r.id = j.region_id
`;

export interface JobFilters {
  query?: string;
  category?: string;
  regionId?: string;
  workArrangement?: string;
  employmentType?: string;
  minSalary?: number;
  skills?: string[];
  companyId?: string;
  status?: string;
  includeUnpublished?: boolean;
}

export async function listJobs(
  filters: JobFilters,
  page: { limit: number; offset: number },
  db: Db = sql,
): Promise<{ items: JobRow[]; total: number }> {
  const rows = await db<Array<JobRow & { total: string }>>`
    ${JOB_SELECT}
    WHERE j.deleted_at IS NULL
      AND (${filters.includeUnpublished ?? false}::boolean OR j.status = 'PUBLISHED')
      AND (${filters.status ?? null}::text IS NULL OR j.status = ${filters.status ?? null})
      AND (${filters.companyId ?? null}::uuid IS NULL OR j.company_id = ${filters.companyId ?? null}::uuid)
      AND (${filters.category ?? null}::text IS NULL OR j.category = ${filters.category ?? null})
      AND (${filters.regionId ?? null}::uuid IS NULL OR j.region_id = ${filters.regionId ?? null}::uuid)
      AND (${filters.workArrangement ?? null}::text IS NULL
           OR j.work_arrangement::text = ${filters.workArrangement ?? null})
      AND (${filters.employmentType ?? null}::text IS NULL
           OR j.employment_type::text = ${filters.employmentType ?? null})
      AND (${filters.minSalary ?? null}::bigint IS NULL
           OR j.salary_max >= ${filters.minSalary ?? null}::bigint)
      AND (${filters.query ?? null}::text IS NULL
           OR to_tsvector('english', j.title || ' ' || j.description)
              @@ plainto_tsquery('english', ${filters.query ?? null}))
      AND (${filters.skills?.length ? filters.skills : null}::text[] IS NULL
           OR EXISTS (
             SELECT 1 FROM job_skills js JOIN skills s ON s.id = js.skill_id
             WHERE js.job_id = j.id AND s.slug = ANY(${filters.skills ?? []}::text[])
           ))
    ORDER BY j.published_at DESC NULLS LAST, j.created_at DESC
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;

  return { items: rows, total: Number(rows[0]?.total ?? 0) };
}

export async function getJob(jobId: string, db: Db = sql): Promise<JobRow | null> {
  const rows = await db<JobRow[]>`${JOB_SELECT} WHERE j.id = ${jobId} AND j.deleted_at IS NULL`;
  return rows[0] ?? null;
}

export async function requireJob(jobId: string, db: Db = sql): Promise<JobRow> {
  const job = await getJob(jobId, db);
  if (!job) throw notFound('Job');
  return job;
}

/** Increment the view counter without blocking the response. */
export async function recordJobView(jobId: string): Promise<void> {
  await sql`UPDATE jobs SET view_count = view_count + 1 WHERE id = ${jobId}`;
}

/** Attach required/preferred skills to a job, replacing what was there. */
export async function setJobSkills(
  jobId: string,
  required: Array<{ slug: string; minLevel?: SkillLevel | null }>,
  preferred: string[],
  db: Db = sql,
): Promise<void> {
  await db`DELETE FROM job_skills WHERE job_id = ${jobId}`;

  for (const skill of required) {
    await db`
      INSERT INTO job_skills (job_id, skill_id, is_required, min_level)
      SELECT ${jobId}, id, true, ${skill.minLevel ?? null} FROM skills WHERE slug = ${skill.slug}
      ON CONFLICT DO NOTHING
    `;
  }
  for (const slug of preferred) {
    await db`
      INSERT INTO job_skills (job_id, skill_id, is_required)
      SELECT ${jobId}, id, false FROM skills WHERE slug = ${slug}
      ON CONFLICT DO NOTHING
    `;
  }
}

/** Convert a job row into matcher input. */
export function jobRequirements(job: JobRow, embedding?: number[] | null): OpportunityRequirements {
  return {
    kind: 'JOB',
    requiredSkills: (job.required_skills ?? []).map((slug) => ({ skillSlug: slug })),
    preferredSkills: (job.preferred_skills ?? []).map((slug) => ({ skillSlug: slug })),
    minYearsExperience: job.min_years_experience,
    minEducation: job.min_education,
    regionId: job.region_id,
    regionName: job.region_name,
    workArrangement: job.work_arrangement,
    employmentType: job.employment_type,
    payMin: job.salary_min ? Number(job.salary_min) : null,
    payMax: job.salary_max ? Number(job.salary_max) : null,
    payPeriod: job.salary_period,
    languagesRequired: job.languages_required,
    requiresLaptop: job.work_arrangement === 'REMOTE',
    requiresLocation: job.work_arrangement !== 'REMOTE',
    embedding: embedding ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  company_id: string;
  company_name: string;
  verification_tier: 'UNVERIFIED' | 'BASIC_VERIFIED' | 'BUSINESS_VERIFIED';
  posted_by: string;
  project_id: string | null;
  title: string;
  description: string;
  category: string;
  expected_output: string;
  quality_requirements: string | null;
  budget_amount: string;
  currency: string;
  pricing_model: string;
  unit_label: string | null;
  unit_count: number | null;
  workers_needed: number;
  workers_assigned: number;
  estimated_hours: string | null;
  deadline: Date | null;
  requires_location: boolean;
  region_id: string | null;
  region_name: string | null;
  requires_laptop: boolean;
  status: string;
  published_at: Date | null;
  ai_assisted: boolean;
  ai_decomposed: boolean;
  view_count: number;
  application_count: number;
  moderation_notes: string | null;
  is_demo: boolean;
  created_at: Date;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
}

const TASK_SELECT = sql`
  SELECT t.*, c.name AS company_name, c.verification_tier, r.name AS region_name,
         count(*) OVER ()::text AS total,
         (SELECT array_agg(s.slug) FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
           WHERE ts.task_id = t.id AND ts.is_required) AS required_skills,
         (SELECT array_agg(s.slug) FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
           WHERE ts.task_id = t.id AND NOT ts.is_required) AS preferred_skills
  FROM tasks t
  JOIN companies c ON c.id = t.company_id
  LEFT JOIN regions r ON r.id = t.region_id
`;

export interface TaskFilters {
  query?: string;
  category?: string;
  regionId?: string;
  minBudget?: number;
  maxBudget?: number;
  skills?: string[];
  companyId?: string;
  status?: string;
  requiresLaptop?: boolean;
  includeUnpublished?: boolean;
  projectId?: string;
}

export async function listTasks(
  filters: TaskFilters,
  page: { limit: number; offset: number },
  db: Db = sql,
): Promise<{ items: TaskRow[]; total: number }> {
  const rows = await db<Array<TaskRow & { total: string }>>`
    ${TASK_SELECT}
    WHERE t.deleted_at IS NULL
      AND (${filters.includeUnpublished ?? false}::boolean OR t.status = 'PUBLISHED')
      AND (${filters.status ?? null}::text IS NULL OR t.status::text = ${filters.status ?? null})
      AND (${filters.companyId ?? null}::uuid IS NULL OR t.company_id = ${filters.companyId ?? null}::uuid)
      AND (${filters.projectId ?? null}::uuid IS NULL OR t.project_id = ${filters.projectId ?? null}::uuid)
      AND (${filters.category ?? null}::text IS NULL OR t.category = ${filters.category ?? null})
      AND (${filters.regionId ?? null}::uuid IS NULL OR t.region_id = ${filters.regionId ?? null}::uuid)
      AND (${filters.minBudget ?? null}::bigint IS NULL OR t.budget_amount >= ${filters.minBudget ?? null}::bigint)
      AND (${filters.maxBudget ?? null}::bigint IS NULL OR t.budget_amount <= ${filters.maxBudget ?? null}::bigint)
      AND (${filters.requiresLaptop ?? null}::boolean IS NULL OR t.requires_laptop = ${filters.requiresLaptop ?? null}::boolean)
      AND (${filters.query ?? null}::text IS NULL
           OR to_tsvector('english', t.title || ' ' || t.description)
              @@ plainto_tsquery('english', ${filters.query ?? null}))
      AND (${filters.skills?.length ? filters.skills : null}::text[] IS NULL
           OR EXISTS (
             SELECT 1 FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
             WHERE ts.task_id = t.id AND s.slug = ANY(${filters.skills ?? []}::text[])
           ))
    ORDER BY t.published_at DESC NULLS LAST, t.created_at DESC
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;

  return { items: rows, total: Number(rows[0]?.total ?? 0) };
}

export async function getTask(taskId: string, db: Db = sql): Promise<TaskRow | null> {
  const rows = await db<TaskRow[]>`${TASK_SELECT} WHERE t.id = ${taskId} AND t.deleted_at IS NULL`;
  return rows[0] ?? null;
}

export async function requireTask(taskId: string, db: Db = sql): Promise<TaskRow> {
  const task = await getTask(taskId, db);
  if (!task) throw notFound('Task');
  return task;
}

export async function recordTaskView(taskId: string): Promise<void> {
  await sql`UPDATE tasks SET view_count = view_count + 1 WHERE id = ${taskId}`;
}

export async function setTaskSkills(
  taskId: string,
  required: string[],
  preferred: string[] = [],
  db: Db = sql,
): Promise<void> {
  await db`DELETE FROM task_skills WHERE task_id = ${taskId}`;
  for (const slug of required) {
    await db`
      INSERT INTO task_skills (task_id, skill_id, is_required)
      SELECT ${taskId}, id, true FROM skills WHERE slug = ${slug}
      ON CONFLICT DO NOTHING
    `;
  }
  for (const slug of preferred) {
    await db`
      INSERT INTO task_skills (task_id, skill_id, is_required)
      SELECT ${taskId}, id, false FROM skills WHERE slug = ${slug}
      ON CONFLICT DO NOTHING
    `;
  }
}

export function taskRequirements(task: TaskRow, embedding?: number[] | null): OpportunityRequirements {
  return {
    kind: 'TASK',
    requiredSkills: (task.required_skills ?? []).map((slug) => ({ skillSlug: slug })),
    preferredSkills: (task.preferred_skills ?? []).map((slug) => ({ skillSlug: slug })),
    minYearsExperience: 0,
    minEducation: null,
    regionId: task.region_id,
    regionName: task.region_name,
    workArrangement: task.requires_location ? 'ONSITE' : 'REMOTE',
    employmentType: 'GIG',
    payMin: Number(task.budget_amount),
    payMax: Number(task.budget_amount),
    payPeriod: 'PER_TASK',
    languagesRequired: [],
    requiresLaptop: task.requires_laptop,
    requiresLocation: task.requires_location,
    embedding: embedding ?? null,
  };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export interface RecommendedJob {
  job: JobRow;
  match: MatchResult;
  alreadyApplied: boolean;
}

/**
 * Recommend jobs to a worker.
 *
 * SQL narrows to a plausible pool (published, not already applied to, and
 * overlapping on at least one skill OR in the worker's region); the matcher
 * then scores and explains. Nothing is hidden by an opaque cutoff — the
 * caller decides what to display.
 */
export async function recommendJobs(
  profileId: string,
  worker: WorkerMatchProfile,
  limit = 20,
  db: Db = sql,
): Promise<RecommendedJob[]> {
  const skillSlugs = worker.skills.map((s) => s.skillSlug);

  const rows = await db<Array<JobRow & { already_applied: boolean; embedding: number[] | null }>>`
    SELECT j.*, c.name AS company_name, c.logo_url AS company_logo, c.verification_tier,
           r.name AS region_name,
           (SELECT array_agg(s.slug) FROM job_skills js JOIN skills s ON s.id = js.skill_id
             WHERE js.job_id = j.id AND js.is_required) AS required_skills,
           (SELECT array_agg(s.slug) FROM job_skills js JOIN skills s ON s.id = js.skill_id
             WHERE js.job_id = j.id AND NOT js.is_required) AS preferred_skills,
           EXISTS (SELECT 1 FROM applications a
                    WHERE a.job_id = j.id AND a.worker_profile_id = ${profileId}) AS already_applied,
           e.embedding
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    LEFT JOIN regions r ON r.id = j.region_id
    LEFT JOIN embeddings e ON e.entity_type = 'job' AND e.entity_id = j.id
    WHERE j.deleted_at IS NULL
      AND j.status = 'PUBLISHED'
      AND (j.deadline IS NULL OR j.deadline >= current_date)
      AND (
        ${skillSlugs.length === 0}::boolean
        OR EXISTS (
          SELECT 1 FROM job_skills js JOIN skills s ON s.id = js.skill_id
          WHERE js.job_id = j.id AND s.slug = ANY(${skillSlugs}::text[])
        )
        OR j.work_arrangement = 'REMOTE'
        OR (${worker.regionId ?? null}::uuid IS NOT NULL AND j.region_id = ${worker.regionId ?? null}::uuid)
      )
    ORDER BY j.published_at DESC
    LIMIT 200
  `;

  return rows
    .map((row) => ({
      job: row,
      match: computeMatch(worker, jobRequirements(row, row.embedding)),
      alreadyApplied: row.already_applied,
    }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);
}

export interface RecommendedTask {
  task: TaskRow;
  match: MatchResult;
  alreadyApplied: boolean;
}

export async function recommendTasks(
  profileId: string,
  worker: WorkerMatchProfile,
  limit = 20,
  db: Db = sql,
): Promise<RecommendedTask[]> {
  const skillSlugs = worker.skills.map((s) => s.skillSlug);

  const rows = await db<Array<TaskRow & { already_applied: boolean; embedding: number[] | null }>>`
    SELECT t.*, c.name AS company_name, c.verification_tier, r.name AS region_name,
           (SELECT array_agg(s.slug) FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
             WHERE ts.task_id = t.id AND ts.is_required) AS required_skills,
           (SELECT array_agg(s.slug) FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
             WHERE ts.task_id = t.id AND NOT ts.is_required) AS preferred_skills,
           EXISTS (SELECT 1 FROM task_applications ta
                    WHERE ta.task_id = t.id AND ta.worker_profile_id = ${profileId}) AS already_applied,
           e.embedding
    FROM tasks t
    JOIN companies c ON c.id = t.company_id
    LEFT JOIN regions r ON r.id = t.region_id
    LEFT JOIN embeddings e ON e.entity_type = 'task' AND e.entity_id = t.id
    WHERE t.deleted_at IS NULL
      AND t.status = 'PUBLISHED'
      AND t.workers_assigned < t.workers_needed
      AND (t.deadline IS NULL OR t.deadline > now())
      AND (
        ${skillSlugs.length === 0}::boolean
        OR EXISTS (
          SELECT 1 FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
          WHERE ts.task_id = t.id AND s.slug = ANY(${skillSlugs}::text[])
        )
        OR NOT t.requires_location
      )
    ORDER BY t.published_at DESC
    LIMIT 200
  `;

  return rows
    .map((row) => ({
      task: row,
      match: computeMatch(worker, taskRequirements(row, row.embedding)),
      alreadyApplied: row.already_applied,
    }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

export async function refreshOpportunityEmbedding(
  kind: 'job' | 'task',
  entityId: string,
  content: { title: string; description: string; category?: string; skills: string[]; expectedOutput?: string | null },
  db: Db = sql,
): Promise<void> {
  const text = opportunityEmbeddingText(content);
  const hash = contentHash(text);

  const existing = await db<{ content_hash: string }[]>`
    SELECT content_hash FROM embeddings WHERE entity_type = ${kind} AND entity_id = ${entityId}
  `;
  if (existing[0]?.content_hash === hash) return;

  const vector = hashingEmbed(text);
  await db`
    INSERT INTO embeddings (entity_type, entity_id, content_hash, embedding, dimensions, model)
    VALUES (${kind}, ${entityId}, ${hash}, ${vector}::float8[], ${vector.length}, 'kazios-hashing-v1')
    ON CONFLICT (entity_type, entity_id) DO UPDATE SET
      content_hash = EXCLUDED.content_hash,
      embedding = EXCLUDED.embedding,
      dimensions = EXCLUDED.dimensions,
      updated_at = now()
  `;
}

/** URL-safe slug, uniqueness enforced per company by the schema. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}
