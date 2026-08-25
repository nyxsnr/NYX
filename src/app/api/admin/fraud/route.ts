import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { pagination } from '@/lib/validation/common';

const query = pagination.extend({
  state: z.enum(['OPEN', 'REVIEWING', 'CONFIRMED', 'DISMISSED']).default('OPEN'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

/** The fraud queue. Every row here is advisory until an admin acts on it. */
export const GET = route(
  { query, auth: 'required', roles: ['ADMIN'], permission: 'admin:fraud:review' },
  async (ctx) => {
    const rows = await sql<
      Array<{
        id: string; rule: string; severity: string; score: number | null; reason: string;
        signals: unknown; entity_type: string; entity_id: string | null; detected_by: string;
        state: string; created_at: Date; user_name: string | null; user_email: string | null;
        user_id: string | null; total: string;
      }>
    >`
      SELECT f.id, f.rule, f.severity::text, f.score, f.reason, f.signals,
             f.entity_type, f.entity_id, f.detected_by, f.state::text, f.created_at,
             u.full_name AS user_name, u.email AS user_email, f.user_id,
             count(*) OVER ()::text AS total
      FROM fraud_flags f
      LEFT JOIN users u ON u.id = f.user_id
      WHERE f.state::text = ${ctx.query.state}
        AND (${ctx.query.severity ?? null}::text IS NULL OR f.severity::text = ${ctx.query.severity ?? null})
      ORDER BY
        CASE f.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
        f.created_at DESC
      LIMIT ${ctx.query.pageSize} OFFSET ${(ctx.query.page - 1) * ctx.query.pageSize}
    `;

    return ok({
      items: rows,
      total: Number(rows[0]?.total ?? 0),
      notice:
        'These are advisory signals for human review. No account has been restricted automatically, and none should be restricted on a signal alone.',
    });
  },
);
