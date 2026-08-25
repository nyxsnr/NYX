'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';
import { formatKes } from '@/lib/i18n';

export function WithdrawPanel({
  available,
  minimum,
  phoneVerified,
  phone,
}: {
  available: number;
  minimum: number;
  phoneVerified: boolean;
  phone: string | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(available / 100);
  const [destination, setDestination] = useState(phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const canWithdraw = phoneVerified && available >= minimum;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ reference: string }>('/api/worker/payouts', {
        amountMinor: Math.round(amount * 100),
        destinationPhone: destination,
        // A fresh key per attempt makes a retry after a network drop safe.
        idempotencyKey: crypto.randomUUID(),
      });
      setDone(result.reference);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not process the withdrawal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Withdraw to mobile money</h2>

      {done ? (
        <Alert tone="success" title="Withdrawal requested">
          Reference {done}. You will be notified when it completes.
        </Alert>
      ) : !phoneVerified ? (
        <Alert tone="warning" title="Verify your phone number first">
          Your earnings must go to a number you have proven you control.{' '}
          <Link href="/worker/profile" className="font-semibold underline">
            Verify your phone
          </Link>
        </Alert>
      ) : available < minimum ? (
        <p className="mt-2 text-sm text-secondary">
          You need at least {formatKes(minimum)} to withdraw. You have {formatKes(available)}.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-4">
          <Field label="Amount (KES)" htmlFor="amount" hint={`Available: ${formatKes(available)}`}>
            <input
              id="amount"
              type="number"
              inputMode="decimal"
              min={minimum / 100}
              max={available / 100}
              step={1}
              className="input"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
            />
          </Field>

          <Field label="Mobile money number" htmlFor="destination">
            <input id="destination" type="tel" inputMode="tel" className="input" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </Field>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <button type="submit" className="btn btn-primary w-full" disabled={busy || !canWithdraw}>
            {busy ? 'Processing…' : `Withdraw ${formatKes(Math.round(amount * 100))}`}
          </button>
        </form>
      )}
    </Card>
  );
}
