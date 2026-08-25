'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Badge, Card } from '@/components/ui';
import { formatKes, timeAgo } from '@/lib/i18n';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  emailVerified: boolean;
  openFlags: number;
  isDemo: boolean;
  earned: number;
  spent: number;
}

export function UserTable({ users }: { users: User[] }) {
  const router = useRouter();
  const [acting, setActing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function moderate(userId: string, action: 'SUSPEND' | 'REINSTATE' | 'CLOSE') {
    if (reason.trim().length < 10) {
      setError('Write a reason. It is recorded and sent to the person affected.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/admin/users/${userId}`, { action, reason });
      setActing(null);
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <ul className="space-y-2">
        {users.map((user) => (
          <li key={user.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{user.fullName}</h2>
                    <Badge>{user.role.toLowerCase()}</Badge>
                    <Badge tone={user.status === 'ACTIVE' ? 'success' : user.status === 'SUSPENDED' ? 'danger' : 'neutral'}>
                      {user.status.toLowerCase()}
                    </Badge>
                    {user.isDemo ? <Badge tone="warning">demo</Badge> : null}
                    {user.openFlags > 0 ? <Badge tone="warning">{user.openFlags} open flag{user.openFlags === 1 ? '' : 's'}</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-secondary">{user.email}</p>
                  <p className="mt-1 text-xs text-muted">
                    Joined {timeAgo(user.createdAt)}
                    {user.lastLoginAt ? ` · last seen ${timeAgo(user.lastLoginAt)}` : ' · never signed in'}
                    {user.emailVerified ? ' · email verified' : ' · email unverified'}
                    {user.earned > 0 ? ` · earned ${formatKes(user.earned)}` : ''}
                    {user.spent > 0 ? ` · spent ${formatKes(user.spent)}` : ''}
                  </p>
                </div>

                {user.role !== 'ADMIN' ? (
                  <button type="button" className="btn btn-ghost shrink-0 px-3 text-sm" onClick={() => setActing(acting === user.id ? null : user.id)}>
                    {acting === user.id ? 'Cancel' : 'Moderate'}
                  </button>
                ) : null}
              </div>

              {acting === user.id ? (
                <div className="mt-4 rounded-lg surface-sunken p-3">
                  <label className="label" htmlFor={`reason-${user.id}`}>
                    Reason (sent to the account holder)
                  </label>
                  <textarea
                    id={`reason-${user.id}`}
                    className="textarea"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why this action is being taken. The person can appeal by replying."
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    {user.status === 'ACTIVE' ? (
                      <button type="button" className="btn btn-danger px-4 text-sm" disabled={busy} onClick={() => moderate(user.id, 'SUSPEND')}>
                        Suspend
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary px-4 text-sm" disabled={busy} onClick={() => moderate(user.id, 'REINSTATE')}>
                        Reinstate
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary px-4 text-sm" disabled={busy} onClick={() => moderate(user.id, 'CLOSE')}>
                      Close account
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-muted">
                    Suspension ends this person&rsquo;s access to income on the platform. Be sure the
                    evidence supports it.
                  </p>
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
