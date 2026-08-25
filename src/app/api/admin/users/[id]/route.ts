import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { AppError, notFound } from '@/lib/http/errors';
import { longText, uuid } from '@/lib/validation/common';
import { revokeAllSessions } from '@/lib/auth/session';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';

const params = z.object({ id: uuid });

export const GET = route(
  { params, auth: 'required', roles: ['ADMIN'], permission: 'admin:user:read' },
  async (ctx) => {
    const users = await sql<
      Array<{ id: string; email: string; full_name: string; role: string; status: string; phone: string | null; created_at: Date; last_login_at: Date | null; is_demo: boolean }>
    >`
      SELECT id, email, full_name, role::text, status::text, phone, created_at, last_login_at, is_demo
      FROM users WHERE id = ${ctx.params.id} AND deleted_at IS NULL
    `;
    const user = users[0];
    if (!user) throw notFound('User');

    const [flags, disputes, payments] = await Promise.all([
      sql`SELECT id, rule, severity, reason, state, created_at FROM fraud_flags WHERE user_id = ${ctx.params.id} ORDER BY created_at DESC LIMIT 20`,
      sql`SELECT id, reference, reason, status, created_at FROM disputes WHERE raised_by = ${ctx.params.id} OR against_user_id = ${ctx.params.id} ORDER BY created_at DESC LIMIT 20`,
      sql<{ earned: string; spent: string }[]>`
        SELECT
          (SELECT coalesce(sum(net_amount), 0)::text FROM payments WHERE payee_user_id = ${ctx.params.id} AND status = 'RELEASED') AS earned,
          (SELECT coalesce(sum(gross_amount), 0)::text FROM payments WHERE payer_user_id = ${ctx.params.id} AND status = 'RELEASED') AS spent
      `,
    ]);

    return ok({
      user,
      fraudFlags: flags,
      disputes,
      totals: { earnedMinor: Number(payments[0]?.earned ?? 0), spentMinor: Number(payments[0]?.spent ?? 0) },
    });
  },
);

const body = z.object({
  action: z.enum(['SUSPEND', 'REINSTATE', 'CLOSE']),
  // Required: a moderation action against someone's income needs a reason on
  // the record, and the reason is sent to the person affected.
  reason: longText(1000),
});

/**
 * Moderate an account.
 *
 * Deliberately manual. No code path anywhere in this application suspends an
 * account automatically from a fraud score or an AI judgement — a human admin
 * must act, with a written reason, and the person is told.
 */
export const PATCH = route(
  { params, body, auth: 'required', roles: ['ADMIN'], permission: 'admin:user:moderate', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    if (ctx.params.id === ctx.auth.user.id) {
      throw new AppError('BAD_REQUEST', 'You cannot moderate your own account.');
    }

    const status = ctx.body.action === 'SUSPEND' ? 'SUSPENDED' : ctx.body.action === 'CLOSE' ? 'CLOSED' : 'ACTIVE';

    const rows = await sql<{ id: string; role: string }[]>`
      UPDATE users SET status = ${status}, failed_login_count = 0, locked_until = NULL
      WHERE id = ${ctx.params.id} AND deleted_at IS NULL
      RETURNING id, role::text
    `;
    if (!rows[0]) throw notFound('User');

    if (status !== 'ACTIVE') await revokeAllSessions(ctx.params.id);

    await notify({
      userId: ctx.params.id,
      kind: `account.${ctx.body.action.toLowerCase()}`,
      title: status === 'ACTIVE' ? 'Your account has been reinstated' : 'Your account has been restricted',
      body:
        status === 'ACTIVE'
          ? `Your KaziOS account is active again. Reason: ${ctx.body.reason}`
          : `Your KaziOS account has been ${status.toLowerCase()}. Reason: ${ctx.body.reason}. If you believe this is a mistake, reply to this message to appeal.`,
      channels: ['IN_APP', 'EMAIL'],
    });

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'ADMIN',
      action: `admin.user.${ctx.body.action.toLowerCase()}`,
      entityType: 'user',
      entityId: ctx.params.id,
      metadata: { reason: ctx.body.reason, status },
      ip: ctx.ip,
    });

    return ok({ status });
  },
);
