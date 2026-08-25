'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, Field } from '@/components/ui';

export function ApplyPanel({
  jobId,
  questions,
  existing,
}: {
  jobId: string;
  questions: Array<{ id: string; prompt: string; required?: boolean }>;
  existing: { id: string; status: string } | null;
}) {
  const router = useRouter();
  const [coverNote, setCoverNote] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ matchScore: number; gaps: string[] } | null>(null);

  if (existing) {
    return (
      <Card>
        <h2 className="font-semibold">You have applied</h2>
        <p className="mt-1 text-sm text-secondary">
          Status: <span className="font-medium">{existing.status.toLowerCase().replace(/_/g, ' ')}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          You will be notified when the employer reviews your application.
        </p>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <h2 className="font-semibold">Application sent</h2>
        <p className="mt-1 text-sm text-secondary">
          Your application was submitted with a {done.matchScore}% match score.
        </p>
        {done.gaps.length > 0 ? (
          <>
            <p className="mt-3 text-sm font-medium">To strengthen future applications like this:</p>
            <ul className="mt-1 list-inside list-disc text-sm text-secondary">
              {done.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ matchScore: number; gaps: string[] }>(`/api/jobs/${jobId}/apply`, {
        coverNote: coverNote || undefined,
        answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' })),
      });
      setDone(result);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your application.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Apply</h2>
      <form onSubmit={submit} className="mt-3 space-y-4">
        <Field
          label="Cover note"
          htmlFor="cover"
          hint="Optional, but one specific paragraph beats a generic page. Say which requirement you can prove."
        >
          <textarea id="cover" className="textarea" rows={5} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} maxLength={4000} />
        </Field>

        {questions.map((question) => (
          <Field key={question.id} label={question.prompt} htmlFor={`q-${question.id}`} required={question.required}>
            <textarea
              id={`q-${question.id}`}
              className="textarea"
              rows={3}
              required={question.required}
              value={answers[question.id] ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
              maxLength={4000}
            />
          </Field>
        ))}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Sending…' : 'Send application'}
        </button>
        <p className="text-xs text-muted">Applying is always free.</p>
      </form>
    </Card>
  );
}
