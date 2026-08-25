'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Badge, Card } from '@/components/ui';
import { timeAgo } from '@/lib/i18n';

interface VerificationRecord {
  id: string;
  kind: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  companyName: string | null;
  registrationNumber: string | null;
  taxPin: string | null;
}

export function VerificationQueue({ records }: { records: VerificationRecord[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tiers, setTiers] = useState<Record<string, string>>({});

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    const note = notes[id]?.trim();
    if (!note || note.length < 5) {
      setError('Record what you checked. It is kept in the audit log.');
      return;
    }

    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/api/admin/verifications/${id}`, {
        decision,
        tier: decision === 'APPROVED' ? (tiers[id] ?? 'BUSINESS_VERIFIED') : undefined,
        notes: note,
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

      <ul className="space-y-3">
        {records.map((record) => (
          <li key={record.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{record.companyName ?? record.userName}</h2>
                    <Badge>{record.kind.replace(/_/g, ' ').toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-secondary">
                    {record.userName} · {record.userEmail}
                  </p>
                  <p className="mt-1 text-xs text-muted">Requested {timeAgo(record.createdAt)}</p>
                </div>
              </div>

              <dl className="mt-3 grid gap-2 rounded-lg surface-sunken p-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Registration number</dt>
                  <dd className="font-medium">{record.registrationNumber ?? 'Not supplied'}</dd>
                </div>
                <div>
                  <dt className="text-muted">KRA PIN</dt>
                  <dd className="font-medium">{record.taxPin ?? 'Not supplied'}</dd>
                </div>
              </dl>

              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="label" htmlFor={`note-${record.id}`}>
                    What you checked
                  </label>
                  <input
                    id={`note-${record.id}`}
                    className="input"
                    value={notes[record.id] ?? ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [record.id]: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`tier-${record.id}`}>
                    Tier
                  </label>
                  <select
                    id={`tier-${record.id}`}
                    className="select"
                    value={tiers[record.id] ?? 'BUSINESS_VERIFIED'}
                    onChange={(e) => setTiers((prev) => ({ ...prev, [record.id]: e.target.value }))}
                  >
                    <option value="BASIC_VERIFIED">Basic verified</option>
                    <option value="BUSINESS_VERIFIED">Business verified</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary px-4 text-sm" disabled={busyId === record.id} onClick={() => decide(record.id, 'APPROVED')}>
                  Approve
                </button>
                <button type="button" className="btn btn-secondary px-4 text-sm" disabled={busyId === record.id} onClick={() => decide(record.id, 'REJECTED')}>
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
