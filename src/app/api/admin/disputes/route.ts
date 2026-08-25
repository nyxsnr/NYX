import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { pagination } from '@/lib/validation/common';

const query = pagination.extend({
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED_WORKER', 'RESOLVED_EMPLOYER', 'RESOLVED_SPLIT', 'WITHDRAWN']).optional(),
});

export const GET = route(
  { query, auth: 'required', roles: ['ADMIN'], permission: 'admin:dispute:resolve' },
  async (ctx) => {
    const rows = await sql<
      Array<{
        id: string; reference: string; reason: string; details: string; status: string;
        created_at: Date; task_title: string | null; raised_by_name: string; against_name: string;
        payment_id: string | null; gross_amount: string | null; currency: string | null; total: string;
      }>
    >`
      SELECT d.id, d.reference, d.reason, d.details, d.status::text, d.created_at,
             t.title AS task_title, ru.full_name AS raised_by_name, au.full_name AS against_name,
             d.payment_id, p.gross_amount, p.currency,
             count(*) OVER ()::text AS total
      FROM disputes d
      JOIN users ru ON ru.id = d.raised_by
      JOIN users au ON au.id = d.against_user_id
      LEFT JOIN tasks t ON t.id = d.task_id
      LEFT JOIN payments p ON p.id = d.payment_id
      WHERE (${ctx.query.status ?? null}::text IS NULL OR d.status::text = ${ctx.query.status ?? null})
      ORDER BY
        CASE d.status WHEN 'OPEN' THEN 0 WHEN 'UNDER_REVIEW' THEN 1 ELSE 2 END,
        d.created_at ASC
      LIMIT ${ctx.query.pageSize} OFFSET ${(ctx.query.page - 1) * ctx.query.pageSize}
    `;

    return ok({
      items: rows.map((d) => ({
        id: d.id,
        reference: d.reference,
        reason: d.reason,
        details: d.details,
        status: d.status,
        createdAt: d.created_at,
        taskTitle: d.task_title,
        raisedBy: d.raised_by_name,
        against: d.against_name,
        paymentId: d.payment_id,
        amountInEscrow: d.gross_amount ? Number(d.gross_amount) : null,
        currency: d.currency,
      })),
      total: Number(rows[0]?.total ?? 0),
    });
  },
);
