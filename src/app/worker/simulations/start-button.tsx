'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';

export function StartSimulationButton({ slug, label }: { slug: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const attempt = await api.post<{ id: string }>('/api/worker/simulations/attempts', { templateSlug: slug });
      router.push(`/worker/simulations/${attempt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the simulation.');
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary w-full" onClick={start} disabled={busy}>
        {busy ? 'Preparing…' : label}
      </button>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
