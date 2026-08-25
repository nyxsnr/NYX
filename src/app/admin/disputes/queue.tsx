'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Badge, Card } from '@/components/ui';
import { formatKes, timeAgo } from '@/lib/i18n';

interface Dispute {
  id: string;
  reference: string;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  taskTitle: string | null;
  raisedBy: string;
  against: string;
  amountInEscrow: number | null;
  submissionSummary: string | null;
  reviewerNotes: string | null;
}

export function DisputeQueue({ disputes }: { disputes: Dispute[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, { notes: string; workerShare: number }>>({});

  function formFor(dispute: Dispute) {
    return forms[dispute.id] ?? { notes: '', workerShare: Math.round((dispute.amountInEscrow ?? 0) / 2) };
  }

  async function resolve(dispute: Dispute, outcome: string) {
    const form = formFor(dispute);
    if (form.notes.trim().length < 20) {
      setError('Write your reasoning. It is recorded permanently and sent to both parties.');
      return;
    }

    setBusyId(dispute.id);
    setError(null);
    try {
      await api.patch(`/api/admin/disputes/${dispute.id}`, {
        outcome,
        notes: form.notes,
        workerAmountMinor: outcome === 'RESOLVED_SPLIT' ? form.workerShare : undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resolve the dispute.');
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
        {disputes.map((dispute) => {
          const form = formFor(dispute);
          const escrow = dispute.amountInEscrow ?? 0;

          return (
            <li key={dispute.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{dispute.reference}</h2>
                      <Badge tone={dispute.status === 'OPEN' ? 'warning' : 'info'}>{dispute.status.replace(/_/g, ' ').toLowerCase()}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-secondary">
                      {dispute.taskTitle ?? 'Task'} · raised by {dispute.raisedBy} against {dispute.against} ·{' '}
                      {timeAgo(dispute.createdAt)}
                    </p>
                  </div>
                  {escrow > 0 ? <span className="font-semibold tabular-nums">{formatKes(escrow)} held</span> : null}
                </div>

                <div className="mt-3 rounded-lg surface-sunken p-3 text-sm">
                  <p className="font-semibold">Reason: {dispute.reason}</p>
                  <p className="mt-1 whitespace-pre-wrap text-secondary">{dispute.details}</p>
                </div>

                {dispute.submissionSummary ? (
                  <div className="mt-3 rounded-lg border-l-2 border-jade-500 pl-3 text-sm">
                    <p className="font-semibold">What the worker submitted</p>
                    <p className="mt-1 whitespace-pre-wrap text-secondary">{dispute.submissionSummary}</p>
                  </div>
                ) : null}

                {dispute.reviewerNotes ? (
                  <div className="mt-3 rounded-lg border-l-2 border-ochre-500 pl-3 text-sm">
                    <p className="font-semibold">What the employer said</p>
                    <p className="mt-1 whitespace-pre-wrap text-secondary">{dispute.reviewerNotes}</p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <label className="label" htmlFor={`notes-${dispute.id}`}>
                    Your reasoning
                  </label>
                  <textarea
                    id={`notes-${dispute.id}`}
                    className="textarea"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForms((prev) => ({ ...prev, [dispute.id]: { ...form, notes: e.target.value } }))}
                    placeholder="Explain the decision. Both parties receive this, and it is kept in the audit log."
                  />
                </div>

                {escrow > 0 ? (
                  <div className="mt-3">
                    <label className="label" htmlFor={`split-${dispute.id}`}>
                      If splitting: worker keeps {formatKes(form.workerShare)} of {formatKes(escrow)}
                    </label>
                    <input
                      id={`split-${dispute.id}`}
                      type="range"
                      min={0}
                      max={escrow}
                      step={100}
                      className="w-full"
                      value={form.workerShare}
                      onChange={(e) => setForms((prev) => ({ ...prev, [dispute.id]: { ...form, workerShare: Number(e.target.value) } }))}
                    />
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary px-4 text-sm" disabled={busyId === dispute.id} onClick={() => resolve(dispute, 'RESOLVED_WORKER')}>
                    Release to worker
                  </button>
                  <button type="button" className="btn btn-secondary px-4 text-sm" disabled={busyId === dispute.id} onClick={() => resolve(dispute, 'RESOLVED_EMPLOYER')}>
                    Refund employer
                  </button>
                  {escrow > 0 ? (
                    <button type="button" className="btn btn-secondary px-4 text-sm" disabled={busyId === dispute.id} onClick={() => resolve(dispute, 'RESOLVED_SPLIT')}>
                      Split
                    </button>
                  ) : null}
                  {dispute.status === 'OPEN' ? (
                    <button type="button" className="btn btn-ghost px-4 text-sm" disabled={busyId === dispute.id} onClick={() => resolve(dispute, 'UNDER_REVIEW')}>
                      Mark under review
                    </button>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
