import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { paginated } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { offsetFor, pagination } from '@/lib/validation/common';

const query = pagination.extend({
  role: z.enum(['WORKER', 'EMPLOYER', 'ADMIN']).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
  q: z.string().trim().max(120).optional(),
  flagged: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

export const GET = route(
  { query, auth: 'required', roles: ['ADMIN'], permission: 'admin:user:read' },
  async (ctx) => {
    const rows = await sql<
      Array<{
        id: string; email: string; full_name: string; role: string; status: string;
        created_at: Date; last_login_at: Date | null; is_demo: boolean;
        email_verified_at: Date | null; phone_verified_at: Date | null;
        open_flags: number; total: string;
      }>
    >`
      SELECT u.id, u.email, u.full_name, u.role::text, u.status::text, u.created_at,
             u.last_login_at, u.is_demo, u.email_verified_at, u.phone_verified_at,
             (SELECT count(*)::int FROM fraud_flags f WHERE f.user_id = u.id AND f.state = 'OPEN') AS open_flags,
             count(*) OVER ()::text AS total
      FROM users u
      WHERE u.deleted_at IS NULL
        AND (${ctx.query.role ?? null}::text IS NULL OR u.role::text = ${ctx.query.role ?? null})
        AND (${ctx.query.status ?? null}::text IS NULL OR u.status::text = ${ctx.query.status ?? null})
        AND (${ctx.query.q ?? null}::text IS NULL
             OR u.full_name ILIKE '%' || ${ctx.query.q ?? ''} || '%'
             OR u.email_normalized LIKE '%' || lower(${ctx.query.q ?? ''}) || '%')
        AND (${ctx.query.flagged ?? false}::boolean = false
             OR EXISTS (SELECT 1 FROM fraud_flags f WHERE f.user_id = u.id AND f.state = 'OPEN'))
      ORDER BY u.created_at DESC
      LIMIT ${ctx.query.pageSize} OFFSET ${offsetFor(ctx.query)}
    `;

    return paginated(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        status: u.status,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
        emailVerified: Boolean(u.email_verified_at),
        phoneVerified: Boolean(u.phone_verified_at),
        openFlags: u.open_flags,
        isDemo: u.is_demo,
      })),
      ctx.query.page,
      ctx.query.pageSize,
      Number(rows[0]?.total ?? 0),
    );
  },
);
