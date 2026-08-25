import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { forbidden, notFound } from '@/lib/http/errors';
import { uuid } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { getAssignment, listSubmissions } from '@/lib/domain/applications';

const params = z.object({ id: uuid });

/** One assignment and its submission history, for review. */
export const GET = route(
  { params, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:submission:review' },
  async (ctx) => {
    await requireEmployer(ctx.auth.user.id);

    const assignment = await getAssignment(ctx.params.id);
    if (!assignment) throw notFound('Assignment');
    if (assignment.posted_by !== ctx.auth.user.id) throw forbidden('That work is not on your task.');

    const submissions = await listSubmissions(ctx.params.id);

    return ok({
      assignment: {
        id: assignment.id,
        taskId: assignment.task_id,
        taskTitle: assignment.task_title,
        taskDescription: assignment.task_description,
        expectedOutput: assignment.expected_output,
        qualityRequirements: assignment.quality_requirements,
        status: assignment.status,
        agreedAmount: Number(assignment.agreed_amount),
        currency: assignment.currency,
        dueAt: assignment.due_at,
        startedAt: assignment.started_at,
        completedAt: assignment.completed_at,
        workerName: assignment.worker_name,
        workerProfileId: assignment.worker_profile_id,
        paymentStatus: assignment.payment_status,
      },
      submissions,
    });
  },
);
