'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Badge, Card } from '@/components/ui';
import { timeAgo } from '@/lib/i18n';

interface Item {
  id: string;
  entityType: 'job' | 'task';
  title: string;
  description: string;
  companyName: string;
  verificationTier: string;
  posterEmail: string;
  createdAt: string;
  flags: Array<{ rule: string; severity: string; reason: string }>;
}

const SEVERITY_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

export function ModerationQueue({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function decide(item: Item, decision: 'APPROVE' | 'REJECT') {
    const reason = reasons[item.id]?.trim();
    if (!reason || reason.length < 5) {
      setError('Write a reason. It is recorded and sent to the employer.');
      return;
    }

    setBusyId(item.id);
    setError(null);
    try {
      await api.post('/api/admin/moderation', {
        entityType: item.entityType,
        entityId: item.id,
        decision,
        reason,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the decision.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <ul className="space-y-4">
        {items.map((item) => (
          <li key={`${item.entityType}-${item.id}`}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{item.title}</h2>
                    <Badge>{item.entityType}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-secondary">
                    {item.companyName} · {item.posterEmail} · submitted {timeAgo(item.createdAt)}
                  </p>
                </div>
                <Badge tone={item.verificationTier === 'UNVERIFIED' ? 'warning' : 'success'}>
                  {item.verificationTier.replace(/_/g, ' ').toLowerCase()}
                </Badge>
              </div>

              {item.flags.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {item.flags.map((flag, index) => (
                    <li key={`${flag.rule}-${index}`} className="rounded-lg surface-sunken p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge tone={SEVERITY_TONE[flag.severity] ?? 'neutral'}>{flag.severity.toLowerCase()}</Badge>
                        <span className="font-medium">{flag.rule.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="mt-1 text-secondary">{flag.reason}</p>
                    </li>
                  ))}
                </ul>
              ) : null}

              <details className="mt-3">
                <summary className="tap cursor-pointer text-sm font-semibold">Read the full posting</summary>
                <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg surface-sunken p-3 text-sm leading-relaxed">
                  {item.description}
                </p>
              </details>

              <div className="mt-4">
                <label className="label" htmlFor={`reason-${item.id}`}>
                  Reason for your decision
                </label>
                <textarea
                  id={`reason-${item.id}`}
                  className="textarea"
                  rows={2}
                  value={reasons[item.id] ?? ''}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="This is recorded in the audit log and sent to the employer."
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary px-4 text-sm" disabled={busyId === item.id} onClick={() => decide(item, 'APPROVE')}>
                  {busyId === item.id ? 'Saving…' : 'Approve and publish'}
                </button>
                <button type="button" className="btn btn-danger px-4 text-sm" disabled={busyId === item.id} onClick={() => decide(item, 'REJECT')}>
                  Reject
                </button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
