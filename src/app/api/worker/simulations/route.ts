import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { listAttempts, listTemplates, recommendTemplates } from '@/lib/domain/simulations';

const query = z.object({ category: z.string().max(80).optional() });

/** Available simulations, the worker's history, and what to do next. */
export const GET = route({ query, auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);

  const [templates, attempts, recommended] = await Promise.all([
    listTemplates({ category: ctx.query.category, profileId: profile.id }),
    listAttempts(profile.id),
    recommendTemplates(profile.id, 3),
  ]);

  return ok({
    templates: templates.map((t) => ({
      slug: t.slug,
      title: t.title,
      category: t.category,
      description: t.description,
      difficulty: t.difficulty,
      minutes: t.time_limit_minutes,
      responseFormat: t.response_format,
      skills: t.skill_slugs ?? [],
      bestScore: t.best_score ?? null,
      attemptCount: t.attempt_count ?? 0,
      hasActiveAttempt: t.has_active_attempt ?? false,
    })),
    attempts: attempts.map((a) => ({
      id: a.id,
      state: a.state,
      score: a.score,
      title: a.template_title,
      slug: a.template_slug,
      category: a.category,
      startedAt: a.started_at,
      evaluatedAt: a.evaluated_at,
      strengths: a.strengths,
      weaknesses: a.weaknesses,
    })),
    recommended: recommended.map((t) => ({
      slug: t.slug,
      title: t.title,
      category: t.category,
      minutes: t.time_limit_minutes,
      skills: t.skill_slugs ?? [],
      reason:
        t.matching_skills > 0
          ? `Matches ${t.matching_skills} skill(s) already on your profile, and employers are hiring for this.`
          : 'Employers are hiring for these skills right now.',
    })),
  });
});
