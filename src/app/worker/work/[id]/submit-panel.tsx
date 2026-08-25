'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';

export function SubmitWorkPanel({ assignmentId, isRevision }: { assignmentId: string; isRevision: boolean }) {
  const router = useRouter();
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [links, setLinks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/worker/work/${assignmentId}/submit`, {
        summary,
        content: content || undefined,
        externalLinks: links
          .split(/[\s,]+/)
          .map((link) => link.trim())
          .filter(Boolean),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your work.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">{isRevision ? 'Resubmit your work' : 'Submit your work'}</h2>
      {isRevision ? (
        <p className="mt-1 text-sm text-secondary">
          Read the employer&rsquo;s feedback above, make the changes, and resubmit.
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Summary of what you delivered" htmlFor="summary" required>
          <textarea
            id="summary"
            className="textarea"
            rows={4}
            required
            maxLength={3000}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What you did, anything you flagged, and any assumptions you made."
          />
        </Field>

        <Field label="Your work" htmlFor="content" hint="Paste text-based deliverables here.">
          <textarea id="content" className="textarea" rows={8} maxLength={50_000} value={content} onChange={(e) => setContent(e.target.value)} />
        </Field>

        <Field label="Links" htmlFor="links" hint="Documents, spreadsheets or files you have shared. One per line.">
          <textarea id="links" className="textarea" rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://" />
        </Field>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <button type="submit" className="btn btn-primary w-full" disabled={busy || summary.trim().length < 10}>
          {busy ? 'Submitting…' : isRevision ? 'Resubmit for review' : 'Submit for review'}
        </button>
        <p className="text-xs text-muted">
          Payment is released to your balance as soon as the employer approves this.
        </p>
      </form>
    </Card>
  );
}
