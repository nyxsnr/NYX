import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { longText, uuid } from '@/lib/validation/common';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { notFound } from '@/lib/http/errors';

/** The moderation queue: postings held for human review. */
export const GET = route(
  { auth: 'required', roles: ['ADMIN'], permission: 'admin:content:moderate' },
  async () => {
    const [jobs, tasks, reports] = await Promise.all([
      sql`
        SELECT j.id, j.title, j.description, j.moderation_notes, j.created_at,
               c.name AS company_name, c.verification_tier, u.email AS poster_email,
               (SELECT json_agg(json_build_object('rule', f.rule, 'severity', f.severity, 'reason', f.reason))
                  FROM fraud_flags f WHERE f.entity_type = 'job' AND f.entity_id = j.id::text) AS flags
        FROM jobs j
        JOIN companies c ON c.id = j.company_id
        JOIN users u ON u.id = j.posted_by
        WHERE j.status = 'PENDING_REVIEW' AND j.deleted_at IS NULL
        ORDER BY j.created_at ASC
      `,
      sql`
        SELECT t.id, t.title, t.description, t.moderation_notes, t.created_at,
               c.name AS company_name, c.verification_tier, u.email AS poster_email,
               (SELECT json_agg(json_build_object('rule', f.rule, 'severity', f.severity, 'reason', f.reason))
                  FROM fraud_flags f WHERE f.entity_type = 'task' AND f.entity_id = t.id::text) AS flags
        FROM tasks t
        JOIN companies c ON c.id = t.company_id
        JOIN users u ON u.id = t.posted_by
        WHERE t.status = 'PENDING_REVIEW' AND t.deleted_at IS NULL
        ORDER BY t.created_at ASC
      `,
      sql`
        SELECT r.id, r.entity_type, r.entity_id, r.category, r.details, r.created_at, u.full_name AS reporter
        FROM reports r JOIN users u ON u.id = r.reporter_id
        WHERE r.state = 'OPEN' ORDER BY r.created_at ASC
      `,
    ]);

    return ok({ jobs, tasks, reports });
  },
);

const body = z.object({
  entityType: z.enum(['job', 'task']),
  entityId: uuid,
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: longText(1000),
});

export const POST = route(
  { body, auth: 'required', roles: ['ADMIN'], permission: 'admin:content:moderate', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const approve = ctx.body.decision === 'APPROVE';

    const rows =
      ctx.body.entityType === 'job'
        ? await sql<{ id: string; posted_by: string; title: string }[]>`
            UPDATE jobs
            SET status = ${approve ? 'PUBLISHED' : 'REJECTED'},
                published_at = ${approve ? sql`now()` : null},
                moderation_notes = ${ctx.body.reason}
            WHERE id = ${ctx.body.entityId} AND status = 'PENDING_REVIEW'
            RETURNING id, posted_by, title
          `
        : await sql<{ id: string; posted_by: string; title: string }[]>`
            UPDATE tasks
            SET status = ${approve ? 'PUBLISHED' : 'CANCELLED'},
                published_at = ${approve ? sql`now()` : null},
                moderation_notes = ${ctx.body.reason}
            WHERE id = ${ctx.body.entityId} AND status = 'PENDING_REVIEW'
            RETURNING id, posted_by, title
          `;

    const entity = rows[0];
    if (!entity) throw notFound('Pending posting');

    await sql`
      UPDATE fraud_flags
      SET state = ${approve ? 'DISMISSED' : 'CONFIRMED'}, reviewed_by = ${ctx.auth.user.id},
          review_notes = ${ctx.body.reason}, reviewed_at = now()
      WHERE entity_type = ${ctx.body.entityType} AND entity_id = ${ctx.body.entityId} AND state = 'OPEN'
    `;

    await notify({
      userId: entity.posted_by,
      kind: `${ctx.body.entityType}.moderation`,
      title: approve ? `"${entity.title}" is now live` : `"${entity.title}" was not approved`,
      body: approve
        ? `Your posting has been reviewed and published.`
        : `Your posting was not approved. Reason: ${ctx.body.reason}. You can edit it and submit again.`,
      channels: ['IN_APP', 'EMAIL'],
    });

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'ADMIN',
      action: `admin.moderation.${ctx.body.decision.toLowerCase()}`,
      entityType: ctx.body.entityType,
      entityId: ctx.body.entityId,
      metadata: { reason: ctx.body.reason },
      ip: ctx.ip,
    });

    return ok({ decision: ctx.body.decision });
  },
);
