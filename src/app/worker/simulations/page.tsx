import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { listAttempts, listTemplates, recommendTemplates } from '@/lib/domain/simulations';
import { Badge, Card, PageHeader, SectionHeading } from '@/components/ui';
import { StartSimulationButton } from './start-button';

export const metadata: Metadata = { title: 'Prove your skills' };
export const dynamic = 'force-dynamic';

export default async function SimulationsPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const [templates, attempts, recommended] = await Promise.all([
    listTemplates({ profileId: profile.id }),
    listAttempts(profile.id),
    recommendTemplates(profile.id, 3),
  ]);

  const byCategory = new Map<string, typeof templates>();
  for (const template of templates) {
    const list = byCategory.get(template.category) ?? [];
    list.push(template);
    byCategory.set(template.category, list);
  }

  const evaluated = attempts.filter((a) => a.state === 'EVALUATED');

  return (
    <>
      <PageHeader
        title="Prove your skills"
        description="A work simulation is a short, realistic exercise scored against a fixed rubric. Only your best attempt counts, so re-taking one can only help you."
      />

      {recommended.length > 0 ? (
        <section className="mb-8">
          <SectionHeading title="Start here" />
          <ul className="grid gap-3 sm:grid-cols-3">
            {recommended.map((template) => (
              <li key={template.slug}>
                <Card className="flex h-full flex-col">
                  <h3 className="font-semibold">{template.title}</h3>
                  <p className="mt-1 text-sm text-secondary">{template.category} · about {template.time_limit_minutes} minutes</p>
                  <p className="mt-2 flex-1 text-sm text-secondary">{template.description}</p>
                  {template.best_score != null ? (
                    <p className="mt-2 text-sm font-semibold text-jade-600 dark:text-jade-300">
                      Your best: {template.best_score}/100
                    </p>
                  ) : null}
                  <div className="mt-4">
                    <StartSimulationButton slug={template.slug} label={template.best_score != null ? 'Re-take' : 'Start'} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {evaluated.length > 0 ? (
        <section className="mb-8">
          <SectionHeading title="Your results" />
          <ul className="space-y-2">
            {evaluated.map((attempt) => (
              <li key={attempt.id}>
                <Link href={`/worker/simulations/${attempt.id}`} className="card flex items-center justify-between gap-4 p-4 hover:surface-sunken">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{attempt.template_title}</p>
                    <p className="text-sm text-muted">
                      {attempt.category} ·{' '}
                      {attempt.evaluated_at ? new Date(attempt.evaluated_at).toLocaleDateString('en-KE') : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xl font-bold tabular-nums">{attempt.score}</p>
                    <Badge tone={(attempt.score ?? 0) >= 70 ? 'success' : (attempt.score ?? 0) >= 50 ? 'warning' : 'neutral'}>
                      {(attempt.score ?? 0) >= 60 ? 'Verified' : 'Attempted'}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHeading title="All simulations" />
        <div className="space-y-6">
          {[...byCategory.entries()].map(([category, list]) => (
            <div key={category}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{category}</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {list.map((template) => (
                  <li key={template.slug}>
                    <Card className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold">{template.title}</h4>
                        {template.best_score != null ? (
                          <Badge tone={template.best_score >= 70 ? 'success' : 'info'}>{template.best_score}/100</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {template.difficulty.toLowerCase()} · about {template.time_limit_minutes} minutes
                      </p>
                      <p className="mt-2 flex-1 text-sm text-secondary">{template.description}</p>
                      <div className="mt-4">
                        <StartSimulationButton
                          slug={template.slug}
                          label={template.has_active_attempt ? 'Continue' : template.best_score != null ? 'Re-take' : 'Start'}
                        />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
