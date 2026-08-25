import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { notFound } from '@/lib/http/errors';
import { uuid } from '@/lib/validation/common';
import { getTask, recordTaskView, taskRequirements } from '@/lib/domain/opportunities';
import { buildMatchProfile, getWorkerProfileByUserId } from '@/lib/domain/workers';
import { computeMatch } from '@/lib/matching';
import { sql } from '@/lib/db/client';
import { track } from '@/lib/analytics';
import { getEnv } from '@/lib/config/env';

const params = z.object({ id: uuid });

export const GET = route({ params, auth: 'optional', rateLimit: { name: 'read', by: 'ip' } }, async (ctx) => {
  const task = await getTask(ctx.params.id);
  if (!task || task.status !== 'PUBLISHED') throw notFound('Task');

  void recordTaskView(task.id);

  let match = null;
  let alreadyApplied = false;

  if (ctx.maybeAuth?.user.role === 'WORKER') {
    const profile = await getWorkerProfileByUserId(ctx.maybeAuth.user.id);
    if (profile) {
      const [matchProfile, applied] = await Promise.all([
        buildMatchProfile(profile.id),
        sql<{ id: string }[]>`
          SELECT id FROM task_applications WHERE task_id = ${task.id} AND worker_profile_id = ${profile.id}
        `,
      ]);
      match = computeMatch(matchProfile, taskRequirements(task));
      alreadyApplied = applied.length > 0;
    }
    void track({
      event: 'task_viewed',
      userId: ctx.maybeAuth.user.id,
      role: 'WORKER',
      entityType: 'task',
      entityId: task.id,
    });
  }

  const feeBps = getEnv().PLATFORM_FEE_BPS;
  const budget = Number(task.budget_amount);

  return ok({
    id: task.id,
    title: task.title,
    description: task.description,
    expectedOutput: task.expected_output,
    qualityRequirements: task.quality_requirements,
    company: task.company_name,
    verificationTier: task.verification_tier,
    category: task.category,
    budget,
    currency: task.currency,
    // Shown up front so nobody discovers the platform fee after doing the work.
    estimatedNetToWorker: budget - Math.round((budget * feeBps) / 10_000),
    platformFeeBps: feeBps,
    pricingModel: task.pricing_model,
    unitLabel: task.unit_label,
    unitCount: task.unit_count,
    workersNeeded: task.workers_needed,
    workersAssigned: task.workers_assigned,
    estimatedHours: task.estimated_hours ? Number(task.estimated_hours) : null,
    deadline: task.deadline,
    requiresLaptop: task.requires_laptop,
    requiresLocation: task.requires_location,
    location: task.region_name,
    requiredSkills: task.required_skills ?? [],
    preferredSkills: task.preferred_skills ?? [],
    publishedAt: task.published_at,
    applicationCount: task.application_count,
    isDemo: task.is_demo,
    match,
    alreadyApplied,
  });
});
