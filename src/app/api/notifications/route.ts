import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { offsetFor, pagination, uuid } from '@/lib/validation/common';
import { markAllNotificationsRead, markNotificationRead, unreadCount } from '@/lib/notifications';

export const GET = route({ query: pagination, auth: 'required' }, async (ctx) => {
  const rows = await sql<
    Array<{ id: string; kind: string; title: string; body: string; action_url: string | null; read_at: Date | null; created_at: Date; total: string }>
  >`
    SELECT id, kind, title, body, action_url, read_at, created_at, count(*) OVER ()::text AS total
    FROM notifications
    WHERE user_id = ${ctx.auth.user.id} AND channel = 'IN_APP'
    ORDER BY created_at DESC
    LIMIT ${ctx.query.pageSize} OFFSET ${offsetFor(ctx.query)}
  `;

  return ok({
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      actionUrl: r.action_url,
      read: Boolean(r.read_at),
      createdAt: r.created_at,
    })),
    total: Number(rows[0]?.total ?? 0),
    unread: await unreadCount(ctx.auth.user.id),
  });
});

const body = z.object({ id: uuid.optional(), all: z.boolean().default(false) });

export const POST = route({ body, auth: 'required' }, async (ctx) => {
  if (ctx.body.all) {
    return ok({ marked: await markAllNotificationsRead(ctx.auth.user.id) });
  }
  if (!ctx.body.id) return ok({ marked: 0 });
  const marked = await markNotificationRead(ctx.auth.user.id, ctx.body.id);
  return ok({ marked: marked ? 1 : 0 });
});
