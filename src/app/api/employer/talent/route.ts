import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { csvList, pagination, uuid, workArrangement } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { computeMatch, type WorkerMatchProfile, type EvidenceLevel, type SkillLevel } from '@/lib/matching';

const query = pagination.extend({
  skills: csvList(10),
  regionId: uuid.optional(),
  workArrangement: workArrangement.optional(),
  minReadiness: z.coerce.number().int().min(0).max(100).default(0),
  verifiedOnly: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

/**
 * Talent search.
 *
 * Only workers who have opted into being searchable appear. Results carry the
 * public profile projection — no contact details, no exact location, no age or
 * employment status. An employer sees capability and evidence, which is the
 * only basis on which this platform will let anyone be judged.
 */
export const GET = route(
  { query, auth: 'required', roles: ['EMPLOYER', 'ADMIN'], permission: 'employer:talent:search', rateLimit: { name: 'read', by: 'user' } },
  async (ctx) => {
    await requireEmployer(ctx.auth.user.id).catch(() => null);

    const rows = await sql<
      Array<{
        id: string; full_name: string; headline: string | null; photo_url: string | null;
        region_id: string | null; region_name: string | null; readiness_score: number;
        years_experience: number; education_level: string | null; work_arrangement: WorkerMatchProfile['workArrangement'];
        preferred_work_types: string[]; desired_income_min: string | null; desired_income_max: string | null;
        income_period: string; languages: string[]; has_laptop: boolean;
        internet_access: WorkerMatchProfile['internetAccess']; is_available: boolean;
        hours_per_week: number | null; completion_rate: string | null; avg_rating: string | null;
        rating_count: number; tasks_completed: number; verified_skill_count: number;
        skills: Array<{ slug: string; level: SkillLevel | null; evidence: EvidenceLevel }> | null;
        total: string;
      }>
    >`
      SELECT wp.id, u.full_name, wp.headline, wp.photo_url, wp.region_id, r.name AS region_name,
             wp.readiness_score, wp.years_experience, wp.education_level, wp.work_arrangement,
             wp.preferred_work_types, wp.desired_income_min, wp.desired_income_max, wp.income_period,
             wp.languages, wp.has_laptop, wp.internet_access, wp.is_available, wp.hours_per_week,
             wp.completion_rate, wp.avg_rating, wp.rating_count, wp.tasks_completed,
             (SELECT count(*)::int FROM worker_skills ws
               WHERE ws.worker_profile_id = wp.id
                 AND ws.evidence_level IN ('SIMULATION_VERIFIED','EMPLOYER_VERIFIED')) AS verified_skill_count,
             (SELECT json_agg(json_build_object(
                'slug', s.slug,
                'level', coalesce(ws.assessed_level, ws.self_reported_level),
                'evidence', ws.evidence_level))
                FROM worker_skills ws JOIN skills s ON s.id = ws.skill_id
               WHERE ws.worker_profile_id = wp.id) AS skills,
             count(*) OVER ()::text AS total
      FROM worker_profiles wp
      JOIN users u ON u.id = wp.user_id
      LEFT JOIN regions r ON r.id = wp.region_id
      WHERE wp.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND u.status = 'ACTIVE'
        AND wp.is_searchable
        AND wp.readiness_score >= ${ctx.query.minReadiness}
        AND (${ctx.query.regionId ?? null}::uuid IS NULL OR wp.region_id = ${ctx.query.regionId ?? null}::uuid)
        AND (${ctx.query.workArrangement ?? null}::text IS NULL
             OR wp.work_arrangement::text IN (${ctx.query.workArrangement ?? 'ANY'}, 'ANY'))
        AND (${ctx.query.skills.length === 0}::boolean OR EXISTS (
              SELECT 1 FROM worker_skills ws JOIN skills s ON s.id = ws.skill_id
              WHERE ws.worker_profile_id = wp.id
                AND s.slug = ANY(${ctx.query.skills}::text[])
                AND (${!ctx.query.verifiedOnly}::boolean
                     OR ws.evidence_level IN ('SIMULATION_VERIFIED','EMPLOYER_VERIFIED'))
            ))
      ORDER BY wp.readiness_score DESC, verified_skill_count DESC
      LIMIT ${ctx.query.pageSize} OFFSET ${(ctx.query.page - 1) * ctx.query.pageSize}
    `;

    // When the employer searched by skill, show each candidate's explained fit.
    const requirements = ctx.query.skills.length
      ? {
          kind: 'JOB' as const,
          requiredSkills: ctx.query.skills.map((slug) => ({ skillSlug: slug })),
          preferredSkills: [],
          minYearsExperience: 0,
          minEducation: null,
          regionId: ctx.query.regionId ?? null,
          regionName: null,
          workArrangement: ctx.query.workArrangement ?? ('ANY' as const),
          employmentType: null,
          payMin: null,
          payMax: null,
          payPeriod: 'MONTHLY',
          languagesRequired: [],
          requiresLaptop: false,
          requiresLocation: false,
        }
      : null;

    return ok({
      items: rows.map((w) => {
        const profile: WorkerMatchProfile = {
          skills: (w.skills ?? []).map((s) => ({
            skillSlug: s.slug,
            level: s.level,
            evidenceLevel: s.evidence,
          })),
          yearsExperience: w.years_experience,
          educationLevel: w.education_level,
          regionId: w.region_id,
          regionName: w.region_name,
          workArrangement: w.work_arrangement,
          preferredWorkTypes: w.preferred_work_types,
          desiredIncomeMin: w.desired_income_min ? Number(w.desired_income_min) : null,
          desiredIncomeMax: w.desired_income_max ? Number(w.desired_income_max) : null,
          incomePeriod: w.income_period,
          languages: w.languages,
          hasLaptop: w.has_laptop,
          internetAccess: w.internet_access,
          isAvailable: w.is_available,
          hoursPerWeek: w.hours_per_week,
          completionRate: w.completion_rate ? Number(w.completion_rate) : null,
          averageRating: w.avg_rating ? Number(w.avg_rating) : null,
          ratingCount: w.rating_count,
          tasksCompleted: w.tasks_completed,
          readinessScore: w.readiness_score,
        };

        const match = requirements ? computeMatch(profile, requirements) : null;

        return {
          profileId: w.id,
          name: w.full_name,
          headline: w.headline,
          photoUrl: w.photo_url,
          location: w.region_name,
          readinessScore: w.readiness_score,
          yearsExperience: w.years_experience,
          verifiedSkillCount: w.verified_skill_count,
          skills: (w.skills ?? []).slice(0, 12),
          isAvailable: w.is_available,
          workArrangement: w.work_arrangement,
          tasksCompleted: w.tasks_completed,
          rating: w.rating_count >= 3 && w.avg_rating ? Number(w.avg_rating) : null,
          ratingCount: w.rating_count,
          match: match ? { score: match.score, band: match.band, reasons: match.reasons.slice(0, 3) } : null,
        };
      }),
      total: Number(rows[0]?.total ?? 0),
      page: ctx.query.page,
      pageSize: ctx.query.pageSize,
    });
  },
);
