import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { notFound } from '@/lib/http/errors';
import { longText, uuid } from '@/lib/validation/common';
import { notify, NOTIFICATIONS } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';

const params = z.object({ id: uuid });
const body = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  tier: z.enum(['BASIC_VERIFIED', 'BUSINESS_VERIFIED']).optional(),
  notes: longText(2000),
});

/** Approve or reject an employer verification. */
export const PATCH = route(
  { params, body, auth: 'required', roles: ['ADMIN'], permission: 'admin:verification:decide', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const rows = await sql<{ id: string; user_id: string; kind: string }[]>`
      UPDATE verification_records
      SET state = ${ctx.body.decision}, reviewer_id = ${ctx.auth.user.id},
          reviewer_notes = ${ctx.body.notes},
          verified_at = ${ctx.body.decision === 'APPROVED' ? sql`now()` : null}
      WHERE id = ${ctx.params.id} AND state = 'PENDING'
      RETURNING id, user_id, kind::text
    `;
    const record = rows[0];
    if (!record) throw notFound('Verification request');

    if (ctx.body.decision === 'APPROVED' && ctx.body.tier) {
      await sql`
        UPDATE companies SET verification_tier = ${ctx.body.tier}, verified_at = now()
        WHERE id = (SELECT company_id FROM employer_profiles WHERE user_id = ${record.user_id})
      `;
    }

    const template =
      ctx.body.decision === 'APPROVED'
        ? NOTIFICATIONS.verificationApproved(record.kind)
        : NOTIFICATIONS.verificationRejected(record.kind, ctx.body.notes);
    await notify({ userId: record.user_id, ...template, channels: ['IN_APP', 'EMAIL'] });

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'ADMIN',
      action: `admin.verification.${ctx.body.decision.toLowerCase()}`,
      entityType: 'verification_record',
      entityId: ctx.params.id,
      metadata: { kind: record.kind, tier: ctx.body.tier, notes: ctx.body.notes },
      ip: ctx.ip,
    });

    if (ctx.body.decision === 'APPROVED') {
      await track({ event: 'verification_approved', userId: record.user_id, properties: { kind: record.kind } });
    }

    return ok({ decision: ctx.body.decision, tier: ctx.body.tier ?? null });
  },
);
