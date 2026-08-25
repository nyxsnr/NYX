import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { paginated } from '@/lib/http/response';
import { csvList, employmentType, offsetFor, pagination, uuid, workArrangement } from '@/lib/validation/common';
import { listJobs } from '@/lib/domain/opportunities';

const query = pagination.extend({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  regionId: uuid.optional(),
  workArrangement: workArrangement.optional(),
  employmentType: employmentType.optional(),
  minSalary: z.coerce.number().int().min(0).optional(),
  skills: csvList(10),
});

/** Public job search. Salary is omitted where the employer chose not to publish it. */
export const GET = route({ query, auth: 'optional', rateLimit: { name: 'read', by: 'ip' } }, async (ctx) => {
  const { items, total } = await listJobs(
    {
      query: ctx.query.q,
      category: ctx.query.category,
      regionId: ctx.query.regionId,
      workArrangement: ctx.query.workArrangement,
      employmentType: ctx.query.employmentType,
      minSalary: ctx.query.minSalary,
      skills: ctx.query.skills,
    },
    { limit: ctx.query.pageSize, offset: offsetFor(ctx.query) },
  );

  return paginated(
    items.map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company_name,
      companyLogo: j.company_logo,
      verificationTier: j.verification_tier,
      category: j.category,
      location: j.region_name,
      town: j.town,
      workArrangement: j.work_arrangement,
      employmentType: j.employment_type,
      salaryMin: j.salary_is_public && j.salary_min ? Number(j.salary_min) : null,
      salaryMax: j.salary_is_public && j.salary_max ? Number(j.salary_max) : null,
      salaryPeriod: j.salary_period,
      currency: j.currency,
      requiredSkills: j.required_skills ?? [],
      openings: j.openings,
      deadline: j.deadline,
      publishedAt: j.published_at,
      applicationCount: j.application_count,
      isDemo: j.is_demo,
    })),
    ctx.query.page,
    ctx.query.pageSize,
    total,
  );
});
