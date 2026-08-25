import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created, paginated } from '@/lib/http/response';
import { json, sql } from '@/lib/db/client';
import {
  educationLevel, employmentType, longText, moneyMinor, offsetFor, optionalLongText,
  optionalShortText, pagination, shortText, skillLevel, uuid, workArrangement,
} from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { listJobs, refreshOpportunityEmbedding, setJobSkills, slugify } from '@/lib/domain/opportunities';
import { screenPosting } from '@/lib/fraud';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';
import { AppError } from '@/lib/http/errors';

export const GET = route({ query: pagination, auth: 'required', roles: ['EMPLOYER'] }, async (ctx) => {
  const employer = await requireEmployer(ctx.auth.user.id);
  const { items, total } = await listJobs(
    { companyId: employer.companyId, includeUnpublished: true },
    { limit: ctx.query.pageSize, offset: offsetFor(ctx.query) },
  );

  return paginated(
    items.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      category: j.category,
      employmentType: j.employment_type,
      workArrangement: j.work_arrangement,
      location: j.region_name,
      openings: j.openings,
      deadline: j.deadline,
      applicationCount: j.application_count,
      viewCount: j.view_count,
      publishedAt: j.published_at,
      createdAt: j.created_at,
      aiAssisted: j.ai_assisted,
    })),
    ctx.query.page,
    ctx.query.pageSize,
    total,
  );
});

const body = z.object({
  title: shortText(150),
  description: longText(20_000),
  responsibilities: optionalLongText(8000),
  category: shortText(80),
  regionId: uuid.optional(),
  town: optionalShortText(120),
  workArrangement: workArrangement.default('ONSITE'),
  employmentType,
  salaryMin: moneyMinor.optional(),
  salaryMax: moneyMinor.optional(),
  salaryPeriod: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL']).default('MONTHLY'),
  salaryIsPublic: z.boolean().default(true),
  minEducation: educationLevel.optional(),
  minYearsExperience: z.number().int().min(0).max(40).default(0),
  languagesRequired: z.array(z.string().max(10)).max(5).default([]),
  requiredSkills: z.array(z.object({ slug: z.string().max(100), minLevel: skillLevel.optional() })).max(15).default([]),
  preferredSkills: z.array(z.string().max(100)).max(15).default([]),
  openings: z.number().int().min(1).max(500).default(1),
  deadline: z.coerce.date().optional(),
  applicationQuestions: z
    .array(z.object({ id: z.string().max(80), prompt: z.string().trim().max(300), required: z.boolean().default(false) }))
    .max(6)
    .default([]),
  aiAssisted: z.boolean().default(false),
  publish: z.boolean().default(false),
})
  .refine((v) => v.salaryMin === undefined || v.salaryMax === undefined || v.salaryMax >= v.salaryMin, {
    message: 'Maximum salary must be at least the minimum.',
    path: ['salaryMax'],
  });

/**
 * Create a job.
 *
 * Every posting is screened before it can go live. Critical signals (advance
 * fees, credential requests) and unlawful discriminatory requirements hold the
 * posting for human review rather than publishing it — protecting workers from
 * scams is the platform's job, not theirs.
 */
export const POST = route(
  { body, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:job:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);

    const postingCounts = await sql<{ count: string; age_days: string }[]>`
      SELECT
        (SELECT count(*)::text FROM jobs
          WHERE company_id = ${employer.companyId} AND created_at > now() - interval '24 hours') AS count,
        (SELECT extract(day FROM now() - created_at)::text FROM users WHERE id = ${ctx.auth.user.id}) AS age_days
    `;

    const screening = screenPosting({
      title: ctx.body.title,
      description: `${ctx.body.description}\n${ctx.body.responsibilities ?? ''}`,
      companyVerificationTier: employer.verificationTier,
      employerPostingCountLast24h: Number(postingCounts[0]?.count ?? 0),
      employerAccountAgeDays: Number(postingCounts[0]?.age_days ?? 0),
      hasSalaryRange: ctx.body.salaryMin !== undefined,
    });

    const blocked = screening.recommendation === 'URGENT_REVIEW';
    const status = blocked
      ? 'PENDING_REVIEW'
      : ctx.body.publish
        ? screening.recommendation === 'REVIEW'
          ? 'PENDING_REVIEW'
          : 'PUBLISHED'
        : 'DRAFT';

    const rows = await sql<{ id: string }[]>`
      INSERT INTO jobs (
        company_id, posted_by, title, slug, description, responsibilities, category,
        region_id, town, work_arrangement, employment_type,
        salary_min, salary_max, salary_period, salary_is_public,
        min_education, min_years_experience, languages_required,
        openings, deadline, application_questions, status, published_at, ai_assisted, moderation_notes
      ) VALUES (
        ${employer.companyId}, ${ctx.auth.user.id}, ${ctx.body.title},
        ${`${slugify(ctx.body.title)}-${Date.now().toString(36)}`},
        ${ctx.body.description}, ${ctx.body.responsibilities ?? null}, ${ctx.body.category},
        ${ctx.body.regionId ?? null}, ${ctx.body.town ?? null}, ${ctx.body.workArrangement}, ${ctx.body.employmentType},
        ${ctx.body.salaryMin ?? null}, ${ctx.body.salaryMax ?? null}, ${ctx.body.salaryPeriod}, ${ctx.body.salaryIsPublic},
        ${ctx.body.minEducation ?? null}, ${ctx.body.minYearsExperience}, ${ctx.body.languagesRequired},
        ${ctx.body.openings}, ${ctx.body.deadline ?? null},
        ${json(ctx.body.applicationQuestions)},
        ${status}, ${status === 'PUBLISHED' ? sql`now()` : null}, ${ctx.body.aiAssisted},
        ${screening.signals.length ? screening.summary : null}
      )
      RETURNING id
    `;
    const jobId = rows[0]?.id;
    if (!jobId) throw new AppError('INTERNAL_ERROR', 'Could not create the job.');

    await setJobSkills(jobId, ctx.body.requiredSkills, ctx.body.preferredSkills);
    await refreshOpportunityEmbedding('job', jobId, {
      title: ctx.body.title,
      description: ctx.body.description,
      category: ctx.body.category,
      skills: ctx.body.requiredSkills.map((s) => s.slug),
    });

    for (const signal of screening.signals) {
      await sql`
        INSERT INTO fraud_flags (user_id, entity_type, entity_id, rule, severity, score, reason, signals, detected_by)
        VALUES (
          ${ctx.auth.user.id}, 'job', ${jobId}, ${signal.rule}, ${signal.severity},
          ${screening.riskScore}, ${signal.reason},
          ${json({ evidence: signal.evidence ?? null })}, 'heuristic'
        )
      `;
    }

    await sql`UPDATE companies SET jobs_posted = jobs_posted + 1 WHERE id = ${employer.companyId}`;

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'EMPLOYER',
      action: 'job.created',
      entityType: 'job',
      entityId: jobId,
      metadata: { status, riskScore: screening.riskScore },
    });

    if (status === 'PUBLISHED') {
      await track({ event: 'job_posted', userId: ctx.auth.user.id, role: 'EMPLOYER', entityType: 'job', entityId: jobId });
    }

    return created({
      id: jobId,
      status,
      // The employer is told plainly why a posting is held, and what to fix.
      moderation:
        status === 'PENDING_REVIEW'
          ? {
              held: true,
              reason: screening.summary,
              issues: screening.signals.map((s) => ({ rule: s.rule, reason: s.reason })),
            }
          : null,
    });
  },
);
