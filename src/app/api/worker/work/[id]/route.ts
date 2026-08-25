import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { forbidden, notFound } from '@/lib/http/errors';
import { uuid } from '@/lib/validation/common';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { getAssignment, listSubmissions } from '@/lib/domain/applications';
import { getEnv } from '@/lib/config/env';

const params = z.object({ id: uuid });

/** The worker's view of one piece of assigned work. */
export const GET = route({ params, auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const assignment = await getAssignment(ctx.params.id);
  if (!assignment) throw notFound('Assignment');
  if (assignment.worker_profile_id !== profile.id) throw forbidden('That is not your assignment.');

  const submissions = await listSubmissions(ctx.params.id);
  const agreed = Number(assignment.agreed_amount);
  const feeBps = getEnv().PLATFORM_FEE_BPS;

  return ok({
    id: assignment.id,
    taskId: assignment.task_id,
    taskTitle: assignment.task_title,
    taskDescription: assignment.task_description,
    expectedOutput: assignment.expected_output,
    qualityRequirements: assignment.quality_requirements,
    company: assignment.company_name,
    status: assignment.status,
    agreedAmount: agreed,
    yourEarnings: agreed - Math.round((agreed * feeBps) / 10_000),
    currency: assignment.currency,
    dueAt: assignment.due_at,
    startedAt: assignment.started_at,
    completedAt: assignment.completed_at,
    // The worker can see the money is locked before they start.
    paymentStatus: assignment.payment_status,
    escrowFunded: assignment.payment_status === 'HELD_IN_ESCROW' || assignment.payment_status === 'RELEASED',
    submissions,
  });
});
