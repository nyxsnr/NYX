'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';

export function StartInterview() {
  const router = useRouter();
  const [roleTitle, setRoleTitle] = useState('');
  const [kind, setKind] = useState('MIXED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<{ sessionId: string }>('/api/worker/interview', {
        roleTitle,
        interviewKind: kind,
      });
      router.push(`/worker/interview/${session.sessionId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the interview.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Start a practice interview</h2>
      <form onSubmit={start} className="mt-4 space-y-4">
        <Field label="What role are you practising for?" htmlFor="role" required>
          <input
            id="role"
            className="input"
            required
            maxLength={150}
            placeholder="e.g. Customer Support Agent"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
          />
        </Field>

        <Field label="Type of interview" htmlFor="kind">
          <select id="kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="MIXED">Mixed — a realistic full interview</option>
            <option value="SCREENING">Screening — first call</option>
            <option value="BEHAVIOURAL">Behavioural — past experience</option>
            <option value="TECHNICAL">Technical — how you do the work</option>
          </select>
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <button type="submit" className="btn btn-primary w-full" disabled={busy || roleTitle.trim().length === 0}>
          {busy ? 'Starting…' : 'Start interview'}
        </button>
        <p className="text-xs text-muted">
          Six questions, about ten minutes. Nothing here is shared with employers unless you choose to
          add the result to your profile.
        </p>
      </form>
    </Card>
  );
}
