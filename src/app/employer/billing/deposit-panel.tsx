'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';
import { formatKes } from '@/lib/i18n';

const PRESETS = [10_000, 25_000, 50_000, 100_000];

export function DepositPanel() {
  const router = useRouter();
  const [amount, setAmount] = useState(25_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<{ status: string; instruction?: string; reference: string }>(
        '/api/employer/billing/deposit',
        { amountMinor: Math.round(amount * 100), idempotencyKey: crypto.randomUUID() },
      );
      setMessage(result.instruction ?? `Top-up ${result.reference} is ${result.status.toLowerCase()}.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the top-up.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Top up your balance</h2>
      <form onSubmit={submit} className="mt-3 space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={amount === preset}
              onClick={() => setAmount(preset)}
              className={`tap rounded-lg border px-3 py-2 text-sm font-semibold ${
                amount === preset ? 'border-jade-600 bg-jade-50 text-jade-800 dark:bg-jade-950 dark:text-jade-100' : ''
              }`}
            >
              {formatKes(preset * 100)}
            </button>
          ))}
        </div>

        <Field label="Amount (KES)" htmlFor="amount">
          <input id="amount" type="number" inputMode="numeric" min={100} step={100} className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}

        <button type="submit" className="btn btn-primary w-full" disabled={busy || amount < 100}>
          {busy ? 'Processing…' : `Top up ${formatKes(Math.round(amount * 100))}`}
        </button>
      </form>
    </Card>
  );
}
