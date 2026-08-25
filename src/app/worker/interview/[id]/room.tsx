'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Alert, Card, PageHeader, ScoreBar, ScoreRing } from '@/components/ui';

interface Session {
  id: string;
  roleTitle: string;
  state: string;
  transcript: Array<{ role: 'interviewer' | 'candidate'; content: string }>;
  questionCount: number;
  overallScore: number | null;
  dimensions: Array<{ name: string; score: number; comment: string }>;
  strengths: string[];
  improvements: string[];
  feedback: string | null;
}

const TOTAL_QUESTIONS = 6;

export function InterviewRoom({ session }: { session: Session }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState(session.transcript);
  const [result, setResult] = useState<{
    overallScore: number;
    dimensions: Array<{ name: string; score: number; comment: string }>;
    strengths: string[];
    improvements: string[];
    feedback: string;
    exampleAnswer: string | null;
  } | null>(
    session.state === 'COMPLETED' && session.overallScore !== null
      ? {
          overallScore: session.overallScore,
          dimensions: session.dimensions,
          strengths: session.strengths,
          improvements: session.improvements,
          feedback: session.feedback ?? '',
          exampleAnswer: null,
        }
      : null,
  );

  const currentQuestion = [...transcript].reverse().find((entry) => entry.role === 'interviewer');
  const asked = transcript.filter((entry) => entry.role === 'interviewer').length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const given = answer;
    setTranscript((prev) => [...prev, { role: 'candidate', content: given }]);
    setAnswer('');

    try {
      const response = await api.post<{
        finished: boolean;
        question?: string;
        overallScore?: number;
        dimensions?: Array<{ name: string; score: number; comment: string }>;
        strengths?: string[];
        improvements?: string[];
        feedback?: string;
        exampleAnswer?: string | null;
      }>(`/api/worker/interview/${session.id}`, { answer: given });

      if (response.finished) {
        setResult({
          overallScore: response.overallScore ?? 0,
          dimensions: response.dimensions ?? [],
          strengths: response.strengths ?? [],
          improvements: response.improvements ?? [],
          feedback: response.feedback ?? '',
          exampleAnswer: response.exampleAnswer ?? null,
        });
        router.refresh();
      } else if (response.question) {
        setTranscript((prev) => [...prev, { role: 'interviewer', content: response.question as string }]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your answer.');
      // Restore the answer so nothing typed is lost on a failure.
      setAnswer(given);
      setTranscript((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <>
        <PageHeader title={`${session.roleTitle} — your result`} />

        <Card className="mb-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <ScoreRing score={result.overallScore} size={130} />
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed">{result.feedback}</p>
          </div>
        </Card>

        {result.dimensions.length > 0 ? (
          <section className="mb-6">
            <h2 className="mb-3 text-lg font-semibold">How you scored</h2>
            <ul className="space-y-3">
              {result.dimensions.map((dimension) => (
                <li key={dimension.name}>
                  <Card>
                    <ScoreBar value={dimension.score} label={dimension.name} />
                    <p className="mt-2 text-sm text-secondary">{dimension.comment}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {result.strengths.length > 0 ? (
            <Card>
              <h2 className="font-semibold">Strengths</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary">
                {result.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          {result.improvements.length > 0 ? (
            <Card>
              <h2 className="font-semibold">What to work on</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary">
                {result.improvements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {result.exampleAnswer ? (
          <Card className="mb-6">
            <h2 className="font-semibold">The shape of a stronger answer</h2>
            <p className="mt-2 text-sm text-secondary">{result.exampleAnswer}</p>
            <p className="mt-2 text-xs text-muted">
              This is a structure to follow, not a script. Fill it only with things you have actually
              done.
            </p>
          </Card>
        ) : null}

        <Link href="/worker/interview" className="btn btn-primary">
          Practise again
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader title={session.roleTitle} description={`Question ${asked} of ${TOTAL_QUESTIONS}`} />

      <div className="mb-4 flex gap-1" role="progressbar" aria-valuenow={asked} aria-valuemin={0} aria-valuemax={TOTAL_QUESTIONS}>
        {Array.from({ length: TOTAL_QUESTIONS }, (_, index) => (
          <span key={index} className={`h-1.5 flex-1 rounded-full ${index < asked ? 'bg-jade-600' : 'surface-sunken'}`} />
        ))}
      </div>

      <div className="space-y-3">
        {transcript.map((entry, index) => (
          <div
            key={index}
            className={`card p-4 ${entry.role === 'candidate' ? 'ml-6 surface-sunken sm:ml-12' : 'mr-6 sm:mr-12'}`}
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {entry.role === 'interviewer' ? 'Interviewer' : 'You'}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.content}</p>
          </div>
        ))}
      </div>

      <Card className="mt-6">
        <form onSubmit={submit}>
          <label className="label" htmlFor="answer">
            Your answer
          </label>
          <textarea
            id="answer"
            className="textarea"
            rows={6}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Give a specific example: what the situation was, what you did, and what resulted."
            disabled={busy}
          />
          <p className="hint">
            {currentQuestion ? 'Answer the question above.' : 'Waiting for the next question.'} Aim for
            60–120 words.
          </p>

          {error ? (
            <div className="mt-3">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy || answer.trim().length === 0}>
            {busy ? 'Sending…' : asked >= TOTAL_QUESTIONS ? 'Finish and get my score' : 'Send answer'}
          </button>
        </form>
      </Card>
    </>
  );
}
