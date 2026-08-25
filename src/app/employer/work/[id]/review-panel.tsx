'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';
import { formatKes } from '@/lib/i18n';

export function ReviewPanel({
  submissionId,
  amount,
  workerName,
}: {
  submissionId: string;
  amount: number;
  workerName: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'approve' | 'revision'>('approve');
  const [rating, setRating] = useState(4);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'approve') {
        await api.post(`/api/employer/submissions/${submissionId}/approve`, {
          qualityRating: rating,
          notes: notes || undefined,
        });
      } else {
        await api.post(`/api/employer/submissions/${submissionId}/revision`, { notes });
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete the review.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Review this work</h2>

      <div className="mt-3 flex gap-2">
        {(
          [
            ['approve', 'Approve'],
            ['revision', 'Request changes'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`tap flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
              mode === value ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4">
        {mode === 'approve' ? (
          <>
            <Field label="Quality rating" htmlFor="rating" hint="This forms part of the worker's public track record.">
              <div className="flex gap-2" role="radiogroup" aria-label="Quality rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rating === value}
                    onClick={() => setRating(value)}
                    className={`tap flex-1 rounded-lg border font-semibold ${
                      rating === value ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Notes for the worker" htmlFor="notes" hint="Optional, but specific feedback helps them do better work for you next time.">
              <textarea id="notes" className="textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </Field>
          </>
        ) : (
          <Field
            label="What needs to change"
            htmlFor="notes"
            hint="Be specific. The worker is redoing this unpaid, so a vague note costs them real time."
            required
          >
            <textarea id="notes" className="textarea" rows={5} required value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
          </Field>
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <button
          type="submit"
          className={`btn w-full ${mode === 'approve' ? 'btn-primary' : 'btn-secondary'}`}
          disabled={busy || (mode === 'revision' && notes.trim().length < 20)}
        >
          {busy
            ? 'Saving…'
            : mode === 'approve'
              ? `Approve and pay ${formatKes(amount)}`
              : 'Send back for revision'}
        </button>

        {mode === 'approve' ? (
          <p className="text-xs text-muted">
            Approving releases the escrowed payment to {workerName} immediately. This cannot be undone.
          </p>
        ) : null}
      </form>
    </Card>
  );
}
