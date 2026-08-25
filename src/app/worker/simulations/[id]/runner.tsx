'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, PageHeader } from '@/components/ui';

interface Attempt {
  id: string;
  title: string;
  brief: string;
  materials: Record<string, unknown>;
  minutes: number;
  responseFormat: string;
  assessedOn: string[];
}

/**
 * The simulation workspace.
 *
 * A draft is kept in localStorage on every keystroke, because these sessions
 * run on mobile connections and losing 20 minutes of work to a dropped signal
 * would be unforgivable. The timer is shown but is not enforced client-side —
 * expiry is decided by the server.
 */
export function SimulationRunner({ attempt }: { attempt: Attempt }) {
  const router = useRouter();
  const storageKey = `kazios:sim:${attempt.id}`;
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Set on mount rather than during render: reading the clock while rendering
  // is impure and would differ between the server and client passes.
  const startedAt = useRef<number>(0);

  useEffect(() => {
    startedAt.current = Date.now();

    // localStorage is an external system, and it is only readable after
    // hydration — restoring the draft during render would produce a server
    // and client mismatch. This is the "synchronise with an external system"
    // case the guidance describes, so the setState here is deliberate.
    try {
      const saved = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setResponse(saved);
    } catch {
      // Private browsing can block storage; the exercise still works without it.
    }

    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [storageKey]);

  function updateResponse(value: string) {
    setResponse(value);
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      /* ignore */
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/worker/simulations/attempts/${attempt.id}`, {
        response,
        timeSpentSeconds: startedAt.current === 0 ? 0 : Math.floor((Date.now() - startedAt.current) / 1000),
      });
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your response.');
      setBusy(false);
    }
  }

  const minutes = Math.floor(elapsed / 60);
  const wordCount = response.trim() ? response.trim().split(/\s+/).length : 0;
  const items = Array.isArray(attempt.materials.items) ? (attempt.materials.items as Array<Record<string, unknown>>) : [];

  return (
    <>
      <PageHeader
        title={attempt.title}
        description={`Suggested time: about ${attempt.minutes} minutes. There is no hard cut-off — take the time you need.`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold">Your brief</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{attempt.brief}</p>
          </Card>

          {items.length > 0 ? (
            <Card>
              <h2 className="text-lg font-semibold">Material to work with</h2>
              <ul className="mt-3 space-y-3">
                {items.map((item, index) => (
                  <li key={index} className="rounded-lg surface-sunken p-3 text-sm">
                    {Object.entries(item)
                      .filter(([key]) => key !== 'id')
                      .map(([key, value]) => (
                        <p key={key} className="break-words">
                          <span className="font-semibold capitalize">{key.replace(/_/g, ' ')}: </span>
                          <span className="text-secondary">{String(value)}</span>
                        </p>
                      ))}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {attempt.assessedOn.length > 0 ? (
            <Card>
              <h2 className="text-sm font-semibold">You will be assessed on</h2>
              <ul className="mt-2 list-inside list-disc text-sm text-secondary">
                {attempt.assessedOn.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0" htmlFor="response">
                Your response
              </label>
              <span className="text-xs tabular-nums text-muted">
                {minutes}m · {wordCount} words
              </span>
            </div>
            <textarea
              id="response"
              className="textarea"
              rows={18}
              value={response}
              onChange={(e) => updateResponse(e.target.value)}
              placeholder="Work through the material and write your answer here. Explain your reasoning — how you decided matters as much as what you decided."
            />
            <p className="hint">Saved on this device as you type.</p>

            {error ? (
              <div className="mt-3">
                <Alert tone="danger">{error}</Alert>
              </div>
            ) : null}

            <button type="button" className="btn btn-primary mt-4 w-full" onClick={submit} disabled={busy || wordCount < 15}>
              {busy ? 'Submitting for assessment…' : 'Submit for assessment'}
            </button>
            {wordCount < 15 ? (
              <p className="hint">Write at least a short paragraph before submitting.</p>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
