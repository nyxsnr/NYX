import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { getReadiness, requireWorkerProfile } from '@/lib/domain/workers';
import { COMPONENT_WEIGHTS } from '@/lib/readiness';
import { Card, PageHeader, ScoreBar, ScoreRing, Badge } from '@/components/ui';

export const metadata: Metadata = { title: 'Your work readiness' };
export const dynamic = 'force-dynamic';

/**
 * The score, fully opened up.
 *
 * The product brief is explicit that this must not be a black box, so this
 * page shows every component, its weight, its confidence, the sentence
 * explaining it, and the exact arithmetic that produces the total.
 */
export default async function ReadinessPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);
  const readiness = await getReadiness(profile.id, 0);

  return (
    <>
      <PageHeader
        title="Your work readiness"
        description="Nothing here is hidden. This is exactly how the number is worked out and how to move it."
      />

      <Card className="mb-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <ScoreRing score={readiness.score} size={140} band={readiness.band} />
          <div className="min-w-0 flex-1">
            <p className="text-secondary">
              Your score is the weighted sum of seven components. Each one is computed from a specific
              fact about your profile — never from an opinion, and never from anything about who you
              are.
            </p>
            <p className="mt-3 text-sm text-muted">
              Last calculated {new Date(readiness.computedAt).toLocaleString('en-KE')}
            </p>
          </div>
        </div>
      </Card>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">The seven components</h2>
        <ul className="space-y-3">
          {readiness.components.map((component) => (
            <li key={component.key}>
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{component.label}</h3>
                  <div className="flex items-center gap-2">
                    <Badge tone={component.confidence === 'HIGH' ? 'success' : component.confidence === 'MEDIUM' ? 'info' : 'neutral'}>
                      {component.confidence.toLowerCase()} confidence
                    </Badge>
                    <span className="text-sm text-muted">
                      weight {Math.round(COMPONENT_WEIGHTS[component.key] * 100)}%
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <ScoreBar value={component.score} />
                </div>

                <p className="mt-3 text-sm text-secondary">{component.explanation}</p>

                <p className="mt-2 text-xs text-muted tabular-nums">
                  {component.score} × {component.weight} = {component.contribution.toFixed(1)} points of your total
                </p>
              </Card>
            </li>
          ))}
        </ul>

        <p className="mt-4 rounded-xl surface-sunken p-4 text-sm tabular-nums">
          <span className="font-semibold">Total: </span>
          {readiness.components.map((c) => c.contribution.toFixed(1)).join(' + ')} ={' '}
          <span className="font-bold">{readiness.score}</span>
        </p>
      </section>

      {readiness.improvements.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Improve your score</h2>
          <p className="mb-3 text-sm text-secondary">
            Ordered by how much each one is actually worth. These estimates use the same weights the
            score itself uses.
          </p>
          <ol className="space-y-3">
            {readiness.improvements.map((action, index) => (
              <li key={action.key}>
                <Link href={action.href} className="card card-interactive flex items-start gap-4 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-jade-600 font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{action.title}</span>
                    <span className="mt-1 block text-sm text-secondary">{action.description}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-semibold text-jade-600 dark:text-jade-300">
                    +{action.estimatedPoints}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
