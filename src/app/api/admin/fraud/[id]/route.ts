import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { notFound } from '@/lib/http/errors';
import { longText, uuid } from '@/lib/validation/common';
import { audit } from '@/lib/audit';

const params = z.object({ id: uuid });
const body = z.object({
  decision: z.enum(['CONFIRMED', 'DISMISSED', 'REVIEWING']),
  notes: longText(2000),
});

/**
 * Act on a fraud flag.
 *
 * Confirming a flag records the finding; it does not itself restrict anyone.
 * Restricting an account is a separate, explicit action on the user record,
 * which keeps "we saw something" distinct from "we cut off someone's income".
 */
export const PATCH = route(
  { params, body, auth: 'required', roles: ['ADMIN'], permission: 'admin:fraud:review', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const rows = await sql<{ id: string; user_id: string | null }[]>`
      UPDATE fraud_flags
      SET state = ${ctx.body.decision}, reviewed_by = ${ctx.auth.user.id},
          review_notes = ${ctx.body.notes}, reviewed_at = now()
      WHERE id = ${ctx.params.id}
      RETURNING id, user_id
    `;
    if (!rows[0]) throw notFound('Fraud flag');

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'ADMIN',
      action: `admin.fraud.${ctx.body.decision.toLowerCase()}`,
      entityType: 'fraud_flag',
      entityId: ctx.params.id,
      metadata: { notes: ctx.body.notes, subjectUserId: rows[0].user_id },
      ip: ctx.ip,
    });

    return ok({
      state: ctx.body.decision,
      note:
        ctx.body.decision === 'CONFIRMED'
          ? 'Flag confirmed. To restrict this account you must take that action explicitly on the user record, with a reason.'
          : null,
    });
  },
);
