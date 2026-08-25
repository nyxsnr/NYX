'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';

interface Draft {
  proposal: string;
  claimsUsed: Array<{ claim: string; backedBy: string }>;
  gapsToAddress: string[];
  notice: string;
}

export function TaskApplyPanel({
  taskId,
  defaultBid,
  existing,
}: {
  taskId: string;
  defaultBid: number;
  existing: { id: string; status: string } | null;
}) {
  const router = useRouter();
  const [proposal, setProposal] = useState('');
  const [bid, setBid] = useState(defaultBid / 100);
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [aiAssisted, setAiAssisted] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (existing) {
    return (
      <Card>
        <h2 className="font-semibold">You have applied</h2>
        <p className="mt-1 text-sm text-secondary">
          Status: <span className="font-medium">{existing.status.toLowerCase()}</span>
        </p>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <h2 className="font-semibold">Proposal sent</h2>
        <p className="mt-1 text-sm text-secondary">
          The employer will review your proposal. If they accept, payment is locked in escrow before
          you start.
        </p>
      </Card>
    );
  }

  async function generateDraft() {
    setDrafting(true);
    setError(null);
    try {
      const result = await api.post<Draft>(`/api/tasks/${taskId}/proposal-draft`);
      setDraft(result);
      setProposal(result.proposal);
      setAiAssisted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not draft a proposal.');
    } finally {
      setDrafting(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/tasks/${taskId}/apply`, {
        proposal: proposal || undefined,
        bidAmount: Math.round(bid * 100),
        estimatedDays: days ? Number(days) : undefined,
        aiAssisted,
      });
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your proposal.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Apply for this task</h2>

      <form onSubmit={submit} className="mt-3 space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="label mb-0" htmlFor="proposal">
              Your proposal
            </label>
            <button type="button" className="btn btn-ghost px-2 text-xs" onClick={generateDraft} disabled={drafting}>
              {drafting ? 'Drafting…' : 'Help me draft'}
            </button>
          </div>
          <textarea
            id="proposal"
            className="textarea"
            rows={7}
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            maxLength={4000}
            placeholder="How will you approach this, and what evidence do you have that you can do it?"
          />
        </div>

        {/* A drafted proposal shows exactly which profile facts back each claim,
            and what the model refused to claim on the worker's behalf. */}
        {draft ? (
          <div className="rounded-xl surface-sunken p-3 text-sm">
            <p className="text-xs text-muted">{draft.notice}</p>
            {draft.claimsUsed.length > 0 ? (
              <>
                <p className="mt-2 font-semibold">Backed by</p>
                <ul className="mt-1 list-inside list-disc text-secondary">
                  {draft.claimsUsed.map((claim) => (
                    <li key={claim.claim}>
                      {claim.claim} — <span className="text-muted">{claim.backedBy}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {draft.gapsToAddress.length > 0 ? (
              <>
                <p className="mt-2 font-semibold">Add yourself if true</p>
                <ul className="mt-1 list-inside list-disc text-secondary">
                  {draft.gapsToAddress.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}

        <Field label="Your price (KES)" htmlFor="bid" hint="The posted budget is pre-filled. You may propose a different figure.">
          <input
            id="bid"
            type="number"
            inputMode="numeric"
            min={1}
            className="input"
            value={bid}
            onChange={(e) => setBid(Number(e.target.value) || 0)}
          />
        </Field>

        <Field label="Days you need" htmlFor="days">
          <input id="days" type="number" inputMode="numeric" min={1} max={365} className="input" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Sending…' : 'Send proposal'}
        </button>
      </form>
    </Card>
  );
}
