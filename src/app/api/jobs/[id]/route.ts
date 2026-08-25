import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { notFound } from '@/lib/http/errors';
import { uuid } from '@/lib/validation/common';
import { getJob, jobRequirements, recordJobView } from '@/lib/domain/opportunities';
import { buildMatchProfile, getWorkerProfileByUserId } from '@/lib/domain/workers';
import { computeMatch } from '@/lib/matching';
import { sql } from '@/lib/db/client';
import { track } from '@/lib/analytics';

const params = z.object({ id: uuid });

/**
 * One job. For a signed-in worker this also returns their explained match
 * score — the "why should I apply?" answer, computed rather than asserted.
 */
export const GET = route({ params, auth: 'optional', rateLimit: { name: 'read', by: 'ip' } }, async (ctx) => {
  const job = await getJob(ctx.params.id);
  if (!job || job.status !== 'PUBLISHED') throw notFound('Job');

  void recordJobView(job.id);

  let match = null;
  let alreadyApplied = false;

  if (ctx.maybeAuth?.user.role === 'WORKER') {
    const profile = await getWorkerProfileByUserId(ctx.maybeAuth.user.id);
    if (profile) {
      const [matchProfile, applied] = await Promise.all([
        buildMatchProfile(profile.id),
        sql<{ id: string }[]>`
          SELECT id FROM applications WHERE job_id = ${job.id} AND worker_profile_id = ${profile.id}
        `,
      ]);
      match = computeMatch(matchProfile, jobRequirements(job));
      alreadyApplied = applied.length > 0;
    }
    void track({
      event: 'job_viewed',
      userId: ctx.maybeAuth.user.id,
      role: 'WORKER',
      entityType: 'job',
      entityId: job.id,
    });
  }

  return ok({
    id: job.id,
    title: job.title,
    description: job.description,
    responsibilities: job.responsibilities,
    company: job.company_name,
    companyLogo: job.company_logo,
    verificationTier: job.verification_tier,
    category: job.category,
    location: job.region_name,
    town: job.town,
    workArrangement: job.work_arrangement,
    employmentType: job.employment_type,
    salaryMin: job.salary_is_public && job.salary_min ? Number(job.salary_min) : null,
    salaryMax: job.salary_is_public && job.salary_max ? Number(job.salary_max) : null,
    salaryPeriod: job.salary_period,
    currency: job.currency,
    salaryIsPublic: job.salary_is_public,
    minEducation: job.min_education,
    minYearsExperience: job.min_years_experience,
    languagesRequired: job.languages_required,
    requiredSkills: job.required_skills ?? [],
    preferredSkills: job.preferred_skills ?? [],
    openings: job.openings,
    deadline: job.deadline,
    applicationQuestions: job.application_questions,
    publishedAt: job.published_at,
    applicationCount: job.application_count,
    aiAssisted: job.ai_assisted,
    isDemo: job.is_demo,
    match,
    alreadyApplied,
  });
});
