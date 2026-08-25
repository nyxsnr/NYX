import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { homePathFor } from '@/lib/auth/rbac';
import { timeAgo } from '@/lib/i18n';
import { EmptyState, PageHeader } from '@/components/ui';
import { MarkAllRead } from './mark-all-read';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const auth = await requireAuth();

  const notifications = await sql<
    Array<{ id: string; kind: string; title: string; body: string; action_url: string | null; read_at: Date | null; created_at: Date }>
  >`
    SELECT id, kind, title, body, action_url, read_at, created_at
    FROM notifications
    WHERE user_id = ${auth.user.id} AND channel = 'IN_APP'
    ORDER BY created_at DESC
    LIMIT 60
  `;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Notifications"
        action={
          <div className="flex gap-2">
            <MarkAllRead />
            <Link href={homePathFor(auth.user.role)} className="btn btn-secondary">
              Back
            </Link>
          </div>
        }
      />

      {notifications.length === 0 ? (
        <EmptyState icon="🔔" title="Nothing yet." description="Updates about your applications, work and payments will appear here." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => {
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{notification.title}</p>
                  {!notification.read_at ? (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-jade-600" aria-label="Unread" />
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-secondary">{notification.body}</p>
                <p className="mt-1 text-xs text-muted">{timeAgo(notification.created_at)}</p>
              </>
            );

            return (
              <li key={notification.id}>
                {notification.action_url ? (
                  <Link href={notification.action_url} className="card block p-4 hover:surface-sunken">
                    {body}
                  </Link>
                ) : (
                  <div className="card p-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
