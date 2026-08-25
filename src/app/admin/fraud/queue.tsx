'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Badge, Card } from '@/components/ui';
import { timeAgo } from '@/lib/i18n';

interface Flag {
  id: string;
  rule: string;
  severity: string;
  score: number | null;
  reason: string;
  evidence: string | null;
  entityType: string;
  entityId: string | null;
  detectedBy: string;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  userId: string | null;
}

const SEVERITY_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

export function FraudQueue({ flags }: { flags: Flag[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(flag: Flag, decision: 'CONFIRMED' | 'DISMISSED' | 'REVIEWING') {
    const note = notes[flag.id]?.trim();
    if (!note || note.length < 5) {
      setError('Record what you found. This goes in the audit log.');
      return;
    }

    setBusyId(flag.id);
    setError(null);
    try {
      await api.patch(`/api/admin/fraud/${flag.id}`, { decision, notes: note });
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

      <ul className="space-y-3">
        {flags.map((flag) => (
          <li key={flag.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONE[flag.severity] ?? 'neutral'}>{flag.severity.toLowerCase()}</Badge>
                    <h2 className="font-semibold">{flag.rule.replace(/[._]/g, ' ')}</h2>
                    <Badge>{flag.entityType}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-secondary">{flag.reason}</p>
                  {flag.evidence ? (
                    <p className="mt-2 rounded-lg surface-sunken p-2 text-sm italic text-muted">&ldquo;{flag.evidence}&rdquo;</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted">
                    {flag.userName ? `${flag.userName} (${flag.userEmail})` : 'No user attached'} · detected by{' '}
                    {flag.detectedBy} · {timeAgo(flag.createdAt)}
                    {flag.score !== null ? ` · risk ${flag.score}` : ''}
                  </p>
                </div>
                {flag.userId ? (
                  <Link href={`/admin/users?q=${encodeURIComponent(flag.userEmail ?? '')}`} className="btn btn-secondary shrink-0 px-3 text-sm">
                    View account
                  </Link>
                ) : null}
              </div>

              <div className="mt-3">
                <label className="label" htmlFor={`note-${flag.id}`}>
                  What you found
                </label>
                <input
                  id={`note-${flag.id}`}
                  className="input"
                  value={notes[flag.id] ?? ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [flag.id]: e.target.value }))}
                  placeholder="Recorded in the audit log."
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary px-4 text-sm" disabled={busyId === flag.id} onClick={() => decide(flag, 'DISMISSED')}>
                  Dismiss — no issue
                </button>
                <button type="button" className="btn btn-ghost px-4 text-sm" disabled={busyId === flag.id} onClick={() => decide(flag, 'REVIEWING')}>
                  Still investigating
                </button>
                <button type="button" className="btn btn-danger px-4 text-sm" disabled={busyId === flag.id} onClick={() => decide(flag, 'CONFIRMED')}>
                  Confirm finding
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">
                Confirming records the finding. It does not restrict the account — do that separately on
                the user record if it is warranted.
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
