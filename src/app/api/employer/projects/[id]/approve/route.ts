import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { AppError, notFound } from '@/lib/http/errors';
import { longText, positiveMoneyMinor, shortText, uuid } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { refreshOpportunityEmbedding, setTaskSkills } from '@/lib/domain/opportunities';
import { getWalletSummary } from '@/lib/payments/service';
import { formatMoney } from '@/lib/payments/ledger';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';

const params = z.object({ id: uuid });
const body = z.object({
  // The employer's final say. They may edit anything before approving.
  tasks: z
    .array(
      z.object({
        title: shortText(150),
        description: longText(20_000),
        expectedOutput: longText(4000),
        category: shortText(80),
        qualityRequirements: longText(4000).optional(),
        budgetMinor: positiveMoneyMinor,
        workersNeeded: z.number().int().min(1).max(50).default(1),
        estimatedHours: z.number().min(0.5).max(1000).optional(),
        requiredSkills: z.array(z.string().max(100)).max(15).default([]),
        include: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(15),
  publish: z.boolean().default(false),
});

/** Approve a decomposition, creating the tasks the employer kept. */
export const POST = route(
  { params, body, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:task:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);

    const projects = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM projects
      WHERE id = ${ctx.params.id} AND company_id = ${employer.companyId} AND deleted_at IS NULL
    `;
    const project = projects[0];
    if (!project) throw notFound('Project');
    if (project.status === 'APPROVED' || project.status === 'ACTIVE') {
      throw new AppError('CONFLICT', 'This project has already been approved.');
    }

    const included = ctx.body.tasks.filter((t) => t.include);
    if (included.length === 0) {
      throw new AppError('BAD_REQUEST', 'Keep at least one task to approve this project.');
    }

    const commitment = included.reduce((acc, t) => acc + t.budgetMinor * t.workersNeeded, 0);

    if (ctx.body.publish) {
      const wallet = await getWalletSummary(ctx.auth.user.id, 'EMPLOYER');
      if (wallet.available < commitment) {
        throw new AppError(
          'INSUFFICIENT_FUNDS',
          `Publishing these tasks commits ${formatMoney(commitment)} to escrow; your available balance is ${formatMoney(wallet.available)}.`,
          { details: { required: commitment, available: wallet.available } },
        );
      }
    }

    const createdIds: string[] = [];
    for (const task of included) {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO tasks (
          company_id, posted_by, project_id, title, description, category, expected_output,
          quality_requirements, budget_amount, workers_needed, estimated_hours,
          status, published_at, ai_assisted, ai_decomposed
        ) VALUES (
          ${employer.companyId}, ${ctx.auth.user.id}, ${ctx.params.id},
          ${task.title}, ${task.description}, ${task.category}, ${task.expectedOutput},
          ${task.qualityRequirements ?? null}, ${task.budgetMinor}, ${task.workersNeeded},
          ${task.estimatedHours ?? null},
          ${ctx.body.publish ? 'PUBLISHED' : 'DRAFT'},
          ${ctx.body.publish ? sql`now()` : null}, true, true
        )
        RETURNING id
      `;
      const taskId = rows[0]?.id;
      if (!taskId) continue;

      await setTaskSkills(taskId, task.requiredSkills);
      await refreshOpportunityEmbedding('task', taskId, {
        title: task.title,
        description: task.description,
        category: task.category,
        skills: task.requiredSkills,
        expectedOutput: task.expectedOutput,
      });
      createdIds.push(taskId);
    }

    await sql`
      UPDATE projects
      SET status = ${ctx.body.publish ? 'ACTIVE' : 'APPROVED'},
          approved_at = now(), approved_by = ${ctx.auth.user.id},
          total_budget = ${commitment}
      WHERE id = ${ctx.params.id}
    `;
    await sql`
      UPDATE companies SET tasks_posted = tasks_posted + ${createdIds.length} WHERE id = ${employer.companyId}
    `;

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'EMPLOYER',
      action: 'project.approved',
      entityType: 'project',
      entityId: ctx.params.id,
      metadata: { tasksCreated: createdIds.length, commitmentMinor: commitment, published: ctx.body.publish },
    });

    if (ctx.body.publish) {
      for (const taskId of createdIds) {
        await track({ event: 'task_posted', userId: ctx.auth.user.id, role: 'EMPLOYER', entityType: 'task', entityId: taskId });
      }
    }

    return ok({ projectId: ctx.params.id, taskIds: createdIds, published: ctx.body.publish, totalCommitment: commitment });
  },
);
