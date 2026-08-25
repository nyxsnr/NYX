import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { AppError, notFound } from '@/lib/http/errors';
import { longText, moneyMinor, uuid } from '@/lib/validation/common';
import { refundPayment, releasePayment } from '@/lib/payments/service';
import { refreshWorkerStats } from '@/lib/domain/workers';
import { notify, NOTIFICATIONS } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';

const params = z.object({ id: uuid });

const body = z.object({
  outcome: z.enum(['RESOLVED_WORKER', 'RESOLVED_EMPLOYER', 'RESOLVED_SPLIT', 'UNDER_REVIEW']),
  notes: longText(4000),
  /** Required for a split: how much of the escrow the worker keeps. */
  workerAmountMinor: moneyMinor.optional(),
});

/**
 * Resolve a dispute.
 *
 * Money moves according to the outcome, in one place, attributed to the
 * deciding admin. There is no automated resolution path: a disagreement about
 * someone's pay is decided by a person who leaves their name on it.
 */
export const PATCH = route(
  { params, body, auth: 'required', roles: ['ADMIN'], permission: 'admin:dispute:resolve', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const rows = await sql<
      Array<{ id: string; reference: string; status: string; payment_id: string | null; assignment_id: string | null; raised_by: string; against_user_id: string; gross_amount: string | null; worker_profile_id: string | null }>
    >`
      SELECT d.id, d.reference, d.status::text, d.payment_id, d.assignment_id,
             d.raised_by, d.against_user_id, p.gross_amount, a.worker_profile_id
      FROM disputes d
      LEFT JOIN payments p ON p.id = d.payment_id
      LEFT JOIN task_assignments a ON a.id = d.assignment_id
      WHERE d.id = ${ctx.params.id}
    `;
    const dispute = rows[0];
    if (!dispute) throw notFound('Dispute');
    if (dispute.status.startsWith('RESOLVED')) {
      throw new AppError('CONFLICT', 'This dispute has already been resolved.');
    }

    if (ctx.body.outcome === 'UNDER_REVIEW') {
      await sql`UPDATE disputes SET status = 'UNDER_REVIEW', resolution_notes = ${ctx.body.notes} WHERE id = ${dispute.id}`;
      await audit({
        actorId: ctx.auth.user.id,
        actorRole: 'ADMIN',
        action: 'admin.dispute.under_review',
        entityType: 'dispute',
        entityId: dispute.id,
        metadata: { notes: ctx.body.notes },
      });
      return ok({ status: 'UNDER_REVIEW' });
    }

    const gross = Number(dispute.gross_amount ?? 0);
    let workerAmount = 0;
    let employerAmount = 0;

    if (dispute.payment_id) {
      if (ctx.body.outcome === 'RESOLVED_WORKER') {
        await releasePayment({ paymentId: dispute.payment_id, actorId: ctx.auth.user.id, reason: `Dispute ${dispute.reference} resolved for the worker` });
        workerAmount = gross;
      } else if (ctx.body.outcome === 'RESOLVED_EMPLOYER') {
        await refundPayment({ paymentId: dispute.payment_id, actorId: ctx.auth.user.id, reason: `Dispute ${dispute.reference} resolved for the employer` });
        employerAmount = gross;
      } else {
        if (ctx.body.workerAmountMinor === undefined) {
          throw new AppError('VALIDATION_FAILED', 'A split resolution needs the amount the worker keeps.', {
            fields: { workerAmountMinor: ['Required for a split resolution.'] },
          });
        }
        if (ctx.body.workerAmountMinor > gross) {
          throw new AppError('BAD_REQUEST', 'The worker cannot be paid more than the amount held in escrow.');
        }
        // A partial refund pays the worker their share and returns the rest.
        await refundPayment({
          paymentId: dispute.payment_id,
          actorId: ctx.auth.user.id,
          reason: `Dispute ${dispute.reference} resolved as a split`,
          amountMinor: gross - ctx.body.workerAmountMinor,
        });
        workerAmount = ctx.body.workerAmountMinor;
        employerAmount = gross - ctx.body.workerAmountMinor;
      }
    }

    await sql`
      UPDATE disputes
      SET status = ${ctx.body.outcome}, resolved_by = ${ctx.auth.user.id},
          resolution_notes = ${ctx.body.notes}, worker_amount = ${workerAmount},
          employer_amount = ${employerAmount}, resolved_at = now()
      WHERE id = ${dispute.id}
    `;

    if (dispute.assignment_id) {
      await sql`
        UPDATE task_assignments
        SET status = ${ctx.body.outcome === 'RESOLVED_EMPLOYER' ? 'CANCELLED' : 'APPROVED'}
        WHERE id = ${dispute.assignment_id}
      `;
    }
    if (dispute.worker_profile_id) await refreshWorkerStats(dispute.worker_profile_id);

    const outcomeText =
      ctx.body.outcome === 'RESOLVED_WORKER'
        ? 'the full amount was released to the worker'
        : ctx.body.outcome === 'RESOLVED_EMPLOYER'
          ? 'the amount was refunded to the employer'
          : 'the amount was split between both parties';

    for (const userId of [dispute.raised_by, dispute.against_user_id]) {
      const template = NOTIFICATIONS.disputeResolved(dispute.reference, `${outcomeText}. ${ctx.body.notes}`);
      await notify({ userId, ...template, actionUrl: '/disputes', channels: ['IN_APP', 'EMAIL'] });
    }

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'ADMIN',
      action: 'admin.dispute.resolved',
      entityType: 'dispute',
      entityId: dispute.id,
      metadata: { outcome: ctx.body.outcome, workerAmount, employerAmount, notes: ctx.body.notes },
      ip: ctx.ip,
    });
    await track({ event: 'dispute_resolved', userId: ctx.auth.user.id, entityType: 'dispute', entityId: dispute.id, properties: { outcome: ctx.body.outcome } });

    return ok({ status: ctx.body.outcome, workerAmount, employerAmount });
  },
);
