import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { EmptyState, PageHeader } from '@/components/ui';
import { UserTable } from './table';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  await requireAuth(['ADMIN']);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const users = await sql<
    Array<{
      id: string; email: string; full_name: string; role: string; status: string;
      created_at: Date; last_login_at: Date | null; is_demo: boolean;
      email_verified_at: Date | null; open_flags: number; total: string;
      earned: string; spent: string;
    }>
  >`
    SELECT u.id, u.email, u.full_name, u.role::text, u.status::text, u.created_at,
           u.last_login_at, u.is_demo, u.email_verified_at,
           (SELECT count(*)::int FROM fraud_flags f WHERE f.user_id = u.id AND f.state = 'OPEN') AS open_flags,
           (SELECT coalesce(sum(net_amount), 0)::text FROM payments
             WHERE payee_user_id = u.id AND status = 'RELEASED') AS earned,
           (SELECT coalesce(sum(gross_amount), 0)::text FROM payments
             WHERE payer_user_id = u.id AND status = 'RELEASED') AS spent,
           count(*) OVER ()::text AS total
    FROM users u
    WHERE u.deleted_at IS NULL
      AND (${params.role ?? null}::text IS NULL OR u.role::text = ${params.role ?? null})
      AND (${params.status ?? null}::text IS NULL OR u.status::text = ${params.status ?? null})
      AND (${params.q ?? null}::text IS NULL
           OR u.full_name ILIKE '%' || ${params.q ?? ''} || '%'
           OR u.email_normalized LIKE '%' || lower(${params.q ?? ''}) || '%')
    ORDER BY u.created_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `;

  const total = Number(users[0]?.total ?? 0);

  return (
    <>
      <PageHeader title="Users" description={`${total.toLocaleString()} account${total === 1 ? '' : 's'}`} />

      <form method="GET" className="card mb-6 grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <div>
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" className="input" placeholder="Name or email" defaultValue={params.q ?? ''} />
        </div>
        <div>
          <label className="sr-only" htmlFor="role">
            Role
          </label>
          <select id="role" name="role" className="select" defaultValue={params.role ?? ''}>
            <option value="">All roles</option>
            <option value="WORKER">Workers</option>
            <option value="EMPLOYER">Employers</option>
            <option value="ADMIN">Admins</option>
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" className="select" defaultValue={params.status ?? ''}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {users.length === 0 ? (
        <EmptyState icon="👥" title="No users match." description="Try a different search." />
      ) : (
        <UserTable
          users={users.map((user) => ({
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            role: user.role,
            status: user.status,
            createdAt: user.created_at.toISOString(),
            lastLoginAt: user.last_login_at?.toISOString() ?? null,
            emailVerified: Boolean(user.email_verified_at),
            openFlags: user.open_flags,
            isDemo: user.is_demo,
            earned: Number(user.earned),
            spent: Number(user.spent),
          }))}
        />
      )}
    </>
  );
}
