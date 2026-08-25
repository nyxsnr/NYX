import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created } from '@/lib/http/response';
import { json, sql } from '@/lib/db/client';
import { longText, moneyMinor, optionalShortText } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { AIService, recordAssessment } from '@/lib/ai/service';
import { track } from '@/lib/analytics';
import { AppError } from '@/lib/http/errors';

const body = z.object({
  title: optionalShortText(150),
  brief: longText(8000),
  budgetKes: moneyMinor.optional(),
  deadline: z.coerce.date().optional(),
});

/**
 * Turn a project brief into proposed tasks.
 *
 * The proposal is saved as a DRAFT project. Nothing is published to workers
 * until the employer reviews and approves it — the AI proposes, the human
 * decides.
 */
export const POST = route(
  { body, auth: 'required', roles: ['EMPLOYER'], permission: 'ai:use', rateLimit: { name: 'aiHeavy', by: 'user' } },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);

    const decomposition = await AIService.decomposeTask(
      {
        title: ctx.body.title,
        brief: ctx.body.brief,
        // The model reasons in whole shillings; the ledger stores cents.
        budgetKes: ctx.body.budgetKes ? Math.round(ctx.body.budgetKes / 100) : undefined,
        deadline: ctx.body.deadline?.toISOString(),
      },
      { userId: ctx.auth.user.id },
    );

    const rows = await sql<{ id: string }[]>`
      INSERT INTO projects (company_id, created_by, title, brief, total_budget, status, ai_proposal)
      VALUES (
        ${employer.companyId}, ${ctx.auth.user.id},
        ${decomposition.data.projectTitle}, ${ctx.body.brief},
        ${ctx.body.budgetKes ?? null}, 'PROPOSED',
        ${json(decomposition.data)}
      )
      RETURNING id
    `;
    const projectId = rows[0]?.id;
    if (!projectId) throw new AppError('INTERNAL_ERROR', 'Could not save the project.');

    await recordAssessment({
      kind: 'TASK_DECOMPOSITION',
      subjectUserId: ctx.auth.user.id,
      entityType: 'project',
      entityId: projectId,
      result: decomposition.data,
      meta: decomposition.meta,
    });

    await track({
      event: 'project_decomposed',
      userId: ctx.auth.user.id,
      role: 'EMPLOYER',
      entityType: 'project',
      entityId: projectId,
      properties: { taskCount: decomposition.data.tasks.length },
    });

    return created({
      projectId,
      ...decomposition.data,
      // Budgets are in whole shillings from the model; convert for the client.
      tasks: decomposition.data.tasks.map((t) => ({ ...t, suggestedBudgetMinor: t.suggestedBudgetKes * 100 })),
      notice: 'Nothing has been published. Review each task, adjust the budgets, then approve to publish.',
    });
  },
);
