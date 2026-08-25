'use client';

import Link from 'next/link';
import { Alert, Card, PageHeader, ScoreBar, ScoreRing, EvidenceBadge } from '@/components/ui';
import { StartSimulationButton } from '../start-button';

interface Result {
  id: string;
  title: string;
  state: string;
  score: number | null;
  criterionScores: Array<{ key: string; label: string; score: number; evidence: string }>;
  strengths: string[];
  weaknesses: string[];
  feedback: string | null;
  evaluatorVersion: string | null;
  response: string | null;
  templateSlug: string;
}

/**
 * The result screen.
 *
 * Shows the criterion-level evidence rather than just a number, because a
 * score with no explanation teaches nothing and cannot be trusted.
 */
export function SimulationResult({ attempt }: { attempt: Result }) {
  const invalid = attempt.state === 'ABANDONED' || attempt.score === null;
  const verified = (attempt.score ?? 0) >= 60;

  return (
    <>
      <PageHeader title={attempt.title} description="Your assessment result." />

      {invalid ? (
        <Alert tone="warning" title="We could not assess this attempt">
          {attempt.feedback ?? 'No substantive response was submitted. You can re-take this simulation at no cost.'}
        </Alert>
      ) : (
        <>
          <Card className="mb-6">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-2">
                <ScoreRing score={attempt.score ?? 0} size={130} />
                {verified ? <EvidenceBadge level="SIMULATION_VERIFIED" /> : <span className="text-sm text-muted">Attempted</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{attempt.feedback}</p>
                {verified ? (
                  <p className="mt-3 text-sm text-secondary">
                    This result now counts as simulation-verified evidence on your profile, and carries
                    real weight when employers search for these skills.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-secondary">
                    Only your best attempt counts, so re-taking this can only improve your profile.
                  </p>
                )}
              </div>
            </div>
          </Card>

          <section className="mb-6">
            <h2 className="mb-3 text-lg font-semibold">How you were scored</h2>
            <ul className="space-y-3">
              {attempt.criterionScores.map((criterion) => (
                <li key={criterion.key}>
                  <Card>
                    <ScoreBar value={criterion.score} label={criterion.label} />
                    <p className="mt-2 text-sm text-secondary">{criterion.evidence}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            {attempt.strengths.length > 0 ? (
              <Card>
                <h2 className="font-semibold">What you did well</h2>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary">
                  {attempt.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {attempt.weaknesses.length > 0 ? (
              <Card>
                <h2 className="font-semibold">What to work on</h2>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-secondary">
                  {attempt.weaknesses.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-56">
          <StartSimulationButton slug={attempt.templateSlug} label="Re-take this simulation" />
        </div>
        <Link href="/worker/jobs" className="btn btn-secondary">
          Find work with this evidence
        </Link>
        <Link href="/worker/simulations" className="btn btn-ghost">
          All simulations
        </Link>
      </div>

      {attempt.evaluatorVersion ? (
        <p className="mt-6 text-xs text-muted">
          Assessed by {attempt.evaluatorVersion}. The rubric and evaluator version are recorded so this
          score stays interpretable over time.
        </p>
      ) : null}
    </>
  );
}
