import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { paginated } from '@/lib/http/response';
import { csvList, offsetFor, pagination, uuid } from '@/lib/validation/common';
import { listTasks } from '@/lib/domain/opportunities';

const query = pagination.extend({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  regionId: uuid.optional(),
  minBudget: z.coerce.number().int().min(0).optional(),
  maxBudget: z.coerce.number().int().min(0).optional(),
  requiresLaptop: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  skills: csvList(10),
});

/** Public task marketplace search. */
export const GET = route({ query, auth: 'optional', rateLimit: { name: 'read', by: 'ip' } }, async (ctx) => {
  const { items, total } = await listTasks(
    {
      query: ctx.query.q,
      category: ctx.query.category,
      regionId: ctx.query.regionId,
      minBudget: ctx.query.minBudget,
      maxBudget: ctx.query.maxBudget,
      requiresLaptop: ctx.query.requiresLaptop,
      skills: ctx.query.skills,
    },
    { limit: ctx.query.pageSize, offset: offsetFor(ctx.query) },
  );

  return paginated(
    items.map((t) => ({
      id: t.id,
      title: t.title,
      company: t.company_name,
      verificationTier: t.verification_tier,
      category: t.category,
      budget: Number(t.budget_amount),
      currency: t.currency,
      pricingModel: t.pricing_model,
      unitLabel: t.unit_label,
      unitCount: t.unit_count,
      workersNeeded: t.workers_needed,
      workersAssigned: t.workers_assigned,
      estimatedHours: t.estimated_hours ? Number(t.estimated_hours) : null,
      deadline: t.deadline,
      requiresLaptop: t.requires_laptop,
      requiresLocation: t.requires_location,
      location: t.region_name,
      requiredSkills: t.required_skills ?? [],
      publishedAt: t.published_at,
      applicationCount: t.application_count,
      isDemo: t.is_demo,
    })),
    ctx.query.page,
    ctx.query.pageSize,
    total,
  );
});
