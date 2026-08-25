import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { getAttempt } from '@/lib/domain/simulations';
import { SimulationRunner } from './runner';
import { SimulationResult } from './result';

export const metadata: Metadata = { title: 'Work simulation' };
export const dynamic = 'force-dynamic';

export default async function SimulationAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const attempt = await getAttempt(id);
  if (!attempt || attempt.worker_profile_id !== profile.id) notFound();

  if (attempt.state === 'STARTED') {
    return (
      <SimulationRunner
        attempt={{
          id: attempt.id,
          title: attempt.title,
          brief: attempt.brief,
          materials: attempt.materials,
          minutes: attempt.time_limit_minutes,
          responseFormat: attempt.response_format,
          assessedOn: (attempt.rubric as Array<{ label?: string }>).map((r) => r.label ?? '').filter(Boolean),
        }}
      />
    );
  }

  return (
    <SimulationResult
      attempt={{
        id: attempt.id,
        title: attempt.template_title,
        state: attempt.state,
        score: attempt.score,
        criterionScores: attempt.criterion_scores as Array<{ key: string; label: string; score: number; evidence: string }>,
        strengths: attempt.strengths,
        weaknesses: attempt.weaknesses,
        feedback: attempt.feedback,
        evaluatorVersion: attempt.evaluator_version,
        response: attempt.response,
        templateSlug: attempt.template_slug,
      }}
    />
  );
}
