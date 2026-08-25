import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created, paginated } from '@/lib/http/response';
import { json, sql } from '@/lib/db/client';
import { AppError } from '@/lib/http/errors';
import {
  longText, offsetFor, optionalLongText, optionalShortText, pagination,
  positiveMoneyMinor, shortText, uuid,
} from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { listTasks, refreshOpportunityEmbedding, setTaskSkills } from '@/lib/domain/opportunities';
import { screenPosting } from '@/lib/fraud';
import { getWalletSummary } from '@/lib/payments/service';
import { formatMoney } from '@/lib/payments/ledger';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';

export const GET = route({ query: pagination, auth: 'required', roles: ['EMPLOYER'] }, async (ctx) => {
  const employer = await requireEmployer(ctx.auth.user.id);
  const { items, total } = await listTasks(
    { companyId: employer.companyId, includeUnpublished: true },
    { limit: ctx.query.pageSize, offset: offsetFor(ctx.query) },
  );

  return paginated(
    items.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      category: t.category,
      budget: Number(t.budget_amount),
      currency: t.currency,
      workersNeeded: t.workers_needed,
      workersAssigned: t.workers_assigned,
      deadline: t.deadline,
      applicationCount: t.application_count,
      viewCount: t.view_count,
      publishedAt: t.published_at,
      createdAt: t.created_at,
      projectId: t.project_id,
      aiDecomposed: t.ai_decomposed,
    })),
    ctx.query.page,
    ctx.query.pageSize,
    total,
  );
});

const body = z.object({
  title: shortText(150),
  description: longText(20_000),
  category: shortText(80),
  expectedOutput: longText(4000),
  qualityRequirements: optionalLongText(4000),
  budgetAmount: positiveMoneyMinor,
  pricingModel: z.enum(['FIXED', 'PER_UNIT']).default('FIXED'),
  unitLabel: optionalShortText(60),
  unitCount: z.number().int().min(1).max(1_000_000).optional(),
  workersNeeded: z.number().int().min(1).max(50).default(1),
  estimatedHours: z.number().min(0.5).max(1000).optional(),
  deadline: z.coerce.date().optional(),
  requiresLocation: z.boolean().default(false),
  regionId: uuid.optional(),
  requiresLaptop: z.boolean().default(false),
  requiredSkills: z.array(z.string().max(100)).max(15).default([]),
  preferredSkills: z.array(z.string().max(100)).max(15).default([]),
  projectId: uuid.optional(),
  aiAssisted: z.boolean().default(false),
  publish: z.boolean().default(false),
});

/**
 * Create a task.
 *
 * Publishing checks the employer's balance covers the full commitment
 * (budget x workers). A task that cannot be funded is never shown to workers —
 * the promise of escrow is only worth something if it is checked up front.
 */
export const POST = route(
  { body, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:task:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);
    const totalCommitment = ctx.body.budgetAmount * ctx.body.workersNeeded;

    if (ctx.body.publish) {
      const wallet = await getWalletSummary(ctx.auth.user.id, 'EMPLOYER');
      if (wallet.available < totalCommitment) {
        throw new AppError(
          'INSUFFICIENT_FUNDS',
          `Publishing this task commits ${formatMoney(totalCommitment)} to escrow, but your available balance is ${formatMoney(wallet.available)}. Top up first — workers should never be asked to start unfunded work.`,
          { details: { required: totalCommitment, available: wallet.available } },
        );
      }
    }

    const counts = await sql<{ count: string; age_days: string }[]>`
      SELECT
        (SELECT count(*)::text FROM tasks
          WHERE company_id = ${employer.companyId} AND created_at > now() - interval '24 hours') AS count,
        (SELECT extract(day FROM now() - created_at)::text FROM users WHERE id = ${ctx.auth.user.id}) AS age_days
    `;

    const screening = screenPosting({
      title: ctx.body.title,
      description: `${ctx.body.description}\n${ctx.body.expectedOutput}`,
      companyVerificationTier: employer.verificationTier,
      employerPostingCountLast24h: Number(counts[0]?.count ?? 0),
      employerAccountAgeDays: Number(counts[0]?.age_days ?? 0),
      hasSalaryRange: true,
    });

    const status =
      screening.recommendation === 'URGENT_REVIEW'
        ? 'PENDING_REVIEW'
        : ctx.body.publish
          ? screening.recommendation === 'REVIEW'
            ? 'PENDING_REVIEW'
            : 'PUBLISHED'
          : 'DRAFT';

    const rows = await sql<{ id: string }[]>`
      INSERT INTO tasks (
        company_id, posted_by, project_id, title, description, category, expected_output,
        quality_requirements, budget_amount, pricing_model, unit_label, unit_count,
        workers_needed, estimated_hours, deadline, requires_location, region_id, requires_laptop,
        status, published_at, ai_assisted, ai_decomposed, moderation_notes
      ) VALUES (
        ${employer.companyId}, ${ctx.auth.user.id}, ${ctx.body.projectId ?? null},
        ${ctx.body.title}, ${ctx.body.description}, ${ctx.body.category}, ${ctx.body.expectedOutput},
        ${ctx.body.qualityRequirements ?? null}, ${ctx.body.budgetAmount}, ${ctx.body.pricingModel},
        ${ctx.body.unitLabel ?? null}, ${ctx.body.unitCount ?? null},
        ${ctx.body.workersNeeded}, ${ctx.body.estimatedHours ?? null}, ${ctx.body.deadline ?? null},
        ${ctx.body.requiresLocation}, ${ctx.body.regionId ?? null}, ${ctx.body.requiresLaptop},
        ${status}, ${status === 'PUBLISHED' ? sql`now()` : null},
        ${ctx.body.aiAssisted}, ${Boolean(ctx.body.projectId)},
        ${screening.signals.length ? screening.summary : null}
      )
      RETURNING id
    `;
    const taskId = rows[0]?.id;
    if (!taskId) throw new AppError('INTERNAL_ERROR', 'Could not create the task.');

    await setTaskSkills(taskId, ctx.body.requiredSkills, ctx.body.preferredSkills);
    await refreshOpportunityEmbedding('task', taskId, {
      title: ctx.body.title,
      description: ctx.body.description,
      category: ctx.body.category,
      skills: ctx.body.requiredSkills,
      expectedOutput: ctx.body.expectedOutput,
    });

    for (const signal of screening.signals) {
      await sql`
        INSERT INTO fraud_flags (user_id, entity_type, entity_id, rule, severity, score, reason, signals, detected_by)
        VALUES (
          ${ctx.auth.user.id}, 'task', ${taskId}, ${signal.rule}, ${signal.severity},
          ${screening.riskScore}, ${signal.reason},
          ${json({ evidence: signal.evidence ?? null })}, 'heuristic'
        )
      `;
    }

    await sql`UPDATE companies SET tasks_posted = tasks_posted + 1 WHERE id = ${employer.companyId}`;

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'EMPLOYER',
      action: 'task.created',
      entityType: 'task',
      entityId: taskId,
      metadata: { status, budgetMinor: ctx.body.budgetAmount, workers: ctx.body.workersNeeded },
    });

    if (status === 'PUBLISHED') {
      await track({ event: 'task_posted', userId: ctx.auth.user.id, role: 'EMPLOYER', entityType: 'task', entityId: taskId });
    }

    return created({
      id: taskId,
      status,
      totalCommitment,
      moderation:
        status === 'PENDING_REVIEW'
          ? { held: true, reason: screening.summary, issues: screening.signals.map((s) => ({ rule: s.rule, reason: s.reason })) }
          : null,
    });
  },
);
