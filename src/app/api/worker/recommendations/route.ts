import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { buildMatchProfile, requireWorkerProfile } from '@/lib/domain/workers';
import { recommendJobs, recommendTasks } from '@/lib/domain/opportunities';
import { recommendTemplates } from '@/lib/domain/simulations';

const query = z.object({
  kind: z.enum(['JOBS', 'TASKS', 'ALL']).default('ALL'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * What this worker should look at next.
 *
 * Every recommendation carries its match score and the reasons behind it, so
 * nothing is presented as an unexplained ranking.
 */
export const GET = route({ query, auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const matchProfile = await buildMatchProfile(profile.id);

  const wantJobs = ctx.query.kind !== 'TASKS';
  const wantTasks = ctx.query.kind !== 'JOBS';

  const [jobs, tasks, simulations] = await Promise.all([
    wantJobs ? recommendJobs(profile.id, matchProfile, ctx.query.limit) : Promise.resolve([]),
    wantTasks ? recommendTasks(profile.id, matchProfile, ctx.query.limit) : Promise.resolve([]),
    recommendTemplates(profile.id, 3),
  ]);

  return ok({
    jobs: jobs.map((r) => ({
      id: r.job.id,
      title: r.job.title,
      company: r.job.company_name,
      verificationTier: r.job.verification_tier,
      location: r.job.region_name,
      workArrangement: r.job.work_arrangement,
      employmentType: r.job.employment_type,
      salaryMin: r.job.salary_is_public && r.job.salary_min ? Number(r.job.salary_min) : null,
      salaryMax: r.job.salary_is_public && r.job.salary_max ? Number(r.job.salary_max) : null,
      salaryPeriod: r.job.salary_period,
      currency: r.job.currency,
      deadline: r.job.deadline,
      matchScore: r.match.score,
      matchBand: r.match.band,
      reasons: r.match.reasons.filter((x) => x.impact === 'POSITIVE').slice(0, 3),
      gaps: r.match.gaps.slice(0, 3),
      alreadyApplied: r.alreadyApplied,
    })),
    tasks: tasks.map((r) => ({
      id: r.task.id,
      title: r.task.title,
      company: r.task.company_name,
      verificationTier: r.task.verification_tier,
      category: r.task.category,
      budget: Number(r.task.budget_amount),
      currency: r.task.currency,
      deadline: r.task.deadline,
      estimatedHours: r.task.estimated_hours ? Number(r.task.estimated_hours) : null,
      requiresLaptop: r.task.requires_laptop,
      matchScore: r.match.score,
      matchBand: r.match.band,
      reasons: r.match.reasons.filter((x) => x.impact === 'POSITIVE').slice(0, 3),
      gaps: r.match.gaps.slice(0, 3),
      alreadyApplied: r.alreadyApplied,
    })),
    // Shown when there is little to recommend: the actionable empty state.
    suggestedSimulations: simulations.map((t) => ({
      slug: t.slug,
      title: t.title,
      category: t.category,
      minutes: t.time_limit_minutes,
      bestScore: t.best_score ?? null,
      skills: t.skill_slugs ?? [],
    })),
  });
});
