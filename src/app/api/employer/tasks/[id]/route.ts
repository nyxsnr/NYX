import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { AppError, notFound } from '@/lib/http/errors';
import { optionalLongText, optionalShortText, uuid } from '@/lib/validation/common';
import { assertOwnsTask, requireEmployer } from '@/lib/domain/employers';
import { getTask } from '@/lib/domain/opportunities';
import { canTransitionTask, type TaskStatus } from '@/lib/domain/applications';
import { getWalletSummary } from '@/lib/payments/service';
import { formatMoney } from '@/lib/payments/ledger';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';

const params = z.object({ id: uuid });

export const GET = route({ params, auth: 'required', roles: ['EMPLOYER'] }, async (ctx) => {
  const employer = await requireEmployer(ctx.auth.user.id);
  await assertOwnsTask(employer.companyId, ctx.params.id);
  const task = await getTask(ctx.params.id);
  if (!task) throw notFound('Task');

  const assignments = await sql<
    Array<{ id: string; status: string; agreed_amount: string; worker_name: string; worker_profile_id: string; started_at: Date; completed_at: Date | null; submission_status: string | null; submission_id: string | null }>
  >`
    SELECT a.id, a.status, a.agreed_amount, u.full_name AS worker_name,
           wp.id AS worker_profile_id, a.started_at, a.completed_at,
           ws.status::text AS submission_status, ws.id AS submission_id
    FROM task_assignments a
    JOIN worker_profiles wp ON wp.id = a.worker_profile_id
    JOIN users u ON u.id = wp.user_id
    LEFT JOIN LATERAL (
      SELECT id, status FROM work_submissions
      WHERE assignment_id = a.id ORDER BY attempt_number DESC LIMIT 1
    ) ws ON true
    WHERE a.task_id = ${ctx.params.id}
    ORDER BY a.started_at DESC
  `;

  return ok({ ...task, assignments });
});

const patch = z.object({
  title: optionalShortText(150),
  description: optionalLongText(20_000),
  expectedOutput: optionalLongText(4000),
  qualityRequirements: optionalLongText(4000),
  deadline: z.coerce.date().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']).optional(),
});

export const PATCH = route(
  { params, body: patch, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:task:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);
    await assertOwnsTask(employer.companyId, ctx.params.id);

    const current = await getTask(ctx.params.id);
    if (!current) throw notFound('Task');

    if (ctx.body.status) {
      if (current.status === 'PENDING_REVIEW' && ctx.body.status === 'PUBLISHED') {
        throw new AppError('FORBIDDEN', 'This task is held for review. An administrator must approve it before it can go live.');
      }
      if (!canTransitionTask(current.status as TaskStatus, ctx.body.status)) {
        throw new AppError('CONFLICT', `A task cannot move from ${current.status} to ${ctx.body.status}.`);
      }
      if (ctx.body.status === 'PUBLISHED') {
        const commitment = Number(current.budget_amount) * current.workers_needed;
        const wallet = await getWalletSummary(ctx.auth.user.id, 'EMPLOYER');
        if (wallet.available < commitment) {
          throw new AppError(
            'INSUFFICIENT_FUNDS',
            `Publishing commits ${formatMoney(commitment)} to escrow; your available balance is ${formatMoney(wallet.available)}.`,
            { details: { required: commitment, available: wallet.available } },
          );
        }
      }
    }

    await sql`
      UPDATE tasks SET
        title = coalesce(${ctx.body.title ?? null}, title),
        description = coalesce(${ctx.body.description ?? null}, description),
        expected_output = coalesce(${ctx.body.expectedOutput ?? null}, expected_output),
        quality_requirements = coalesce(${ctx.body.qualityRequirements ?? null}, quality_requirements),
        deadline = coalesce(${ctx.body.deadline ?? null}::timestamptz, deadline),
        status = coalesce(${ctx.body.status ?? null}::task_status, status),
        published_at = ${ctx.body.status === 'PUBLISHED' && !current.published_at ? sql`now()` : sql`published_at`}
      WHERE id = ${ctx.params.id}
    `;

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'EMPLOYER',
      action: 'task.updated',
      entityType: 'task',
      entityId: ctx.params.id,
      metadata: { status: ctx.body.status },
    });

    if (ctx.body.status === 'PUBLISHED' && !current.published_at) {
      await track({ event: 'task_posted', userId: ctx.auth.user.id, role: 'EMPLOYER', entityType: 'task', entityId: ctx.params.id });
    }

    return ok(await getTask(ctx.params.id));
  },
);
