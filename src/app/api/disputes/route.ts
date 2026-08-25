import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created, ok } from '@/lib/http/response';
import { randomBytes } from 'node:crypto';
import { sql } from '@/lib/db/client';
import { conflict, forbidden, notFound } from '@/lib/http/errors';
import { longText, shortText, uuid } from '@/lib/validation/common';
import { notify, NOTIFICATIONS } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';

export const GET = route({ auth: 'required' }, async (ctx) => {
  const rows = await sql<
    Array<{ id: string; reference: string; reason: string; status: string; created_at: Date; resolved_at: Date | null; task_title: string | null; raised_by: string }>
  >`
    SELECT d.id, d.reference, d.reason, d.status::text, d.created_at, d.resolved_at,
           t.title AS task_title, d.raised_by
    FROM disputes d
    LEFT JOIN tasks t ON t.id = d.task_id
    WHERE d.raised_by = ${ctx.auth.user.id} OR d.against_user_id = ${ctx.auth.user.id}
    ORDER BY d.created_at DESC
  `;
  return ok(rows.map((r) => ({ ...r, youRaisedIt: r.raised_by === ctx.auth.user.id })));
});

const body = z.object({
  assignmentId: uuid,
  reason: shortText(200),
  details: longText(5000),
});

/**
 * Open a dispute.
 *
 * Escrowed funds stay held until an administrator resolves it — neither party
 * can move the money while the disagreement is live.
 */
export const POST = route(
  { body, auth: 'required', permission: 'dispute:open', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const rows = await sql<
      Array<{ id: string; task_id: string; status: string; posted_by: string; worker_user_id: string; payment_id: string | null }>
    >`
      SELECT a.id, a.task_id, a.status, t.posted_by, wp.user_id AS worker_user_id,
             (SELECT p.id FROM payments p WHERE p.assignment_id = a.id ORDER BY p.created_at DESC LIMIT 1) AS payment_id
      FROM task_assignments a
      JOIN tasks t ON t.id = a.task_id
      JOIN worker_profiles wp ON wp.id = a.worker_profile_id
      WHERE a.id = ${ctx.body.assignmentId}
    `;
    const assignment = rows[0];
    if (!assignment) throw notFound('Assignment');

    const isEmployer = assignment.posted_by === ctx.auth.user.id;
    const isWorker = assignment.worker_user_id === ctx.auth.user.id;
    if (!isEmployer && !isWorker) throw forbidden('You were not part of this work.');

    const open = await sql<{ id: string }[]>`
      SELECT id FROM disputes
      WHERE assignment_id = ${ctx.body.assignmentId} AND status IN ('OPEN','UNDER_REVIEW')
    `;
    if (open[0]) throw conflict('A dispute on this work is already open.');

    const reference = `KZ-D-${randomBytes(3).toString('hex').toUpperCase()}`;
    const againstUserId = isEmployer ? assignment.worker_user_id : assignment.posted_by;

    const inserted = await sql<{ id: string }[]>`
      INSERT INTO disputes (
        reference, assignment_id, task_id, payment_id, raised_by, against_user_id, reason, details
      ) VALUES (
        ${reference}, ${ctx.body.assignmentId}, ${assignment.task_id}, ${assignment.payment_id},
        ${ctx.auth.user.id}, ${againstUserId}, ${ctx.body.reason}, ${ctx.body.details}
      )
      RETURNING id
    `;

    await sql`UPDATE task_assignments SET status = 'DISPUTED' WHERE id = ${ctx.body.assignmentId}`;
    await sql`UPDATE tasks SET status = 'DISPUTED' WHERE id = ${assignment.task_id}`;

    const template = NOTIFICATIONS.disputeOpened(reference);
    await notify({ userId: againstUserId, ...template, actionUrl: '/disputes', channels: ['IN_APP', 'EMAIL'] });

    await audit({
      actorId: ctx.auth.user.id,
      action: 'dispute.opened',
      entityType: 'dispute',
      entityId: inserted[0]?.id ?? null,
      metadata: { reference, assignmentId: ctx.body.assignmentId },
    });
    await track({ event: 'dispute_opened', userId: ctx.auth.user.id, entityType: 'dispute', entityId: inserted[0]?.id });

    return created({
      id: inserted[0]?.id,
      reference,
      message:
        'Your dispute has been opened and the payment stays held until it is resolved. An administrator will review it and contact both parties.',
    });
  },
);
