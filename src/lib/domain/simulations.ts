/**
 * Work simulations — the proof-of-work engine.
 *
 * This is where a claim becomes evidence. A scored attempt is the only route
 * (other than an employer confirming real paid work) by which a skill on a
 * profile is promoted past AI_INFERRED, so the integrity rules here matter:
 *
 *   * templates and rubrics are human-authored; the model instantiates and
 *     scores against them but never invents its own criteria;
 *   * every score is stored with the rubric snapshot, the criterion-level
 *     evidence and the evaluator version that produced it;
 *   * only the worker's BEST attempt counts, so re-taking is always safe and a
 *     worker is never punished for practising;
 *   * an invalid attempt is marked invalid rather than scored zero.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { json, sql, withTransaction, type Db } from '@/lib/db/client';
import { conflict, forbidden, notFound } from '@/lib/http/errors';
import { AIService, recordAssessment } from '@/lib/ai/service';
import { PROMPT_VERSIONS } from '@/lib/ai/prompts';
import { track } from '@/lib/analytics';
import { notify, NOTIFICATIONS } from '@/lib/notifications';
import { recomputeReadiness, upsertWorkerSkill } from './workers';
import type { SkillLevel } from '@/lib/matching';

export interface TemplateRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  scenario_template: Record<string, unknown>;
  rubric: unknown[];
  response_format: string;
  difficulty: SkillLevel;
  time_limit_minutes: number;
  version: number;
  skill_slugs: string[] | null;
  /** The worker's own history with this template, when a profile is supplied. */
  best_score?: number | null;
  attempt_count?: number;
  has_active_attempt?: boolean;
}

export async function listTemplates(
  options: { category?: string; profileId?: string } = {},
  db: Db = sql,
): Promise<TemplateRow[]> {
  return db<TemplateRow[]>`
    SELECT t.id, t.slug, t.title, t.category, t.description, t.scenario_template, t.rubric,
           t.response_format, t.difficulty, t.time_limit_minutes, t.version,
           (SELECT array_agg(s.slug) FROM simulation_template_skills sts
              JOIN skills s ON s.id = sts.skill_id WHERE sts.template_id = t.id) AS skill_slugs,
           (SELECT max(sa.score) FROM simulation_attempts sa
             WHERE sa.template_id = t.id
               AND sa.worker_profile_id = ${options.profileId ?? null}::uuid
               AND sa.state = 'EVALUATED') AS best_score,
           (SELECT count(*)::int FROM simulation_attempts sa
             WHERE sa.template_id = t.id
               AND sa.worker_profile_id = ${options.profileId ?? null}::uuid) AS attempt_count,
           EXISTS (SELECT 1 FROM simulation_attempts sa
                    WHERE sa.template_id = t.id
                      AND sa.worker_profile_id = ${options.profileId ?? null}::uuid
                      AND sa.state = 'STARTED') AS has_active_attempt
    FROM simulation_templates t
    WHERE t.is_active
      AND (${options.category ?? null}::text IS NULL OR t.category = ${options.category ?? null})
    ORDER BY t.category, t.difficulty, t.title
  `;
}

/**
 * Which simulations to suggest next.
 *
 * Ranked by employer demand for the skills a template evidences, minus what
 * the worker has already proven. The goal is to point people at the work that
 * actually exists, not at whatever is easiest to score well on.
 */
export async function recommendTemplates(profileId: string, limit = 5, db: Db = sql) {
  const rows = await db<
    Array<TemplateRow & { demand: number; already_proven: boolean; matching_skills: number }>
  >`
    SELECT t.id, t.slug, t.title, t.category, t.description, t.scenario_template, t.rubric,
           t.response_format, t.difficulty, t.time_limit_minutes, t.version,
           (SELECT array_agg(s.slug) FROM simulation_template_skills sts
              JOIN skills s ON s.id = sts.skill_id WHERE sts.template_id = t.id) AS skill_slugs,
           coalesce((SELECT round(avg(s.demand_score))::int FROM simulation_template_skills sts
              JOIN skills s ON s.id = sts.skill_id WHERE sts.template_id = t.id), 50) AS demand,
           EXISTS (SELECT 1 FROM simulation_attempts sa
                    WHERE sa.template_id = t.id AND sa.worker_profile_id = ${profileId}
                      AND sa.state = 'EVALUATED' AND sa.score >= 70) AS already_proven,
           (SELECT count(*)::int FROM simulation_template_skills sts
              JOIN worker_skills ws ON ws.skill_id = sts.skill_id
             WHERE sts.template_id = t.id AND ws.worker_profile_id = ${profileId}) AS matching_skills,
           (SELECT max(sa.score) FROM simulation_attempts sa
             WHERE sa.template_id = t.id AND sa.worker_profile_id = ${profileId}
               AND sa.state = 'EVALUATED') AS best_score
    FROM simulation_templates t
    WHERE t.is_active
    ORDER BY already_proven ASC, matching_skills DESC, demand DESC
    LIMIT ${limit}
  `;
  return rows;
}

export interface AttemptRow {
  id: string;
  simulation_id: string;
  template_id: string;
  worker_profile_id: string;
  state: 'STARTED' | 'SUBMITTED' | 'EVALUATED' | 'ABANDONED' | 'EXPIRED';
  response: string | null;
  score: number | null;
  criterion_scores: unknown[];
  strengths: string[];
  weaknesses: string[];
  feedback: string | null;
  evaluator_version: string | null;
  started_at: Date;
  submitted_at: Date | null;
  expires_at: Date | null;
  evaluated_at: Date | null;
  time_spent_seconds: number | null;
  title: string;
  brief: string;
  materials: Record<string, unknown>;
  rubric: unknown[];
  template_title: string;
  template_slug: string;
  category: string;
  time_limit_minutes: number;
  response_format: string;
}

const ATTEMPT_SELECT = sql`
  SELECT sa.*, s.title, s.brief, s.materials, s.rubric,
         t.title AS template_title, t.slug AS template_slug, t.category,
         t.time_limit_minutes, t.response_format
  FROM simulation_attempts sa
  JOIN simulations s ON s.id = sa.simulation_id
  JOIN simulation_templates t ON t.id = sa.template_id
`;

/**
 * Start an attempt.
 *
 * Generated instances are cached per template and reused across workers to
 * control AI spend, but a worker never receives an instance they have already
 * attempted — otherwise a re-take would be a memory test, not a skill test.
 */
export async function startAttempt(input: {
  templateSlug: string;
  profileId: string;
  userId: string;
}): Promise<AttemptRow> {
  const templates = await sql<TemplateRow[]>`
    SELECT t.*, (SELECT array_agg(s.slug) FROM simulation_template_skills sts
                   JOIN skills s ON s.id = sts.skill_id WHERE sts.template_id = t.id) AS skill_slugs
    FROM simulation_templates t WHERE t.slug = ${input.templateSlug} AND t.is_active
  `;
  const template = templates[0];
  if (!template) throw notFound('Simulation');

  const active = await sql<{ id: string }[]>`
    SELECT id FROM simulation_attempts
    WHERE worker_profile_id = ${input.profileId} AND template_id = ${template.id} AND state = 'STARTED'
  `;
  if (active[0]) {
    const existing = await getAttempt(active[0].id);
    if (existing) return existing;
  }

  // Reuse a cached instance the worker has not seen; otherwise generate one.
  const unseen = await sql<{ id: string }[]>`
    SELECT s.id FROM simulations s
    WHERE s.template_id = ${template.id} AND s.is_active
      AND NOT EXISTS (
        SELECT 1 FROM simulation_attempts sa
        WHERE sa.simulation_id = s.id AND sa.worker_profile_id = ${input.profileId}
      )
    ORDER BY random()
    LIMIT 1
  `;

  let simulationId = unseen[0]?.id;

  if (!simulationId) {
    const generated = await AIService.generateSimulation(
      { template: template as unknown as Record<string, unknown>, seed: randomUUID() },
      { userId: input.userId },
    );

    const rows = await sql<{ id: string }[]>`
      INSERT INTO simulations (template_id, title, brief, materials, rubric, generator_version)
      VALUES (
        ${template.id}, ${generated.data.title}, ${generated.data.brief},
        ${json(generated.data.materials)},
        ${json(template.rubric)},
        ${`${generated.meta.provider}:${generated.meta.model}:${generated.meta.promptVersion}`}
      )
      RETURNING id
    `;
    simulationId = rows[0]?.id;
    if (!simulationId) throw conflict('Could not prepare the simulation.');
  }

  const expiresAt = new Date(Date.now() + template.time_limit_minutes * 60_000 * 3);

  const attempts = await sql<{ id: string }[]>`
    INSERT INTO simulation_attempts (simulation_id, template_id, worker_profile_id, expires_at)
    VALUES (${simulationId}, ${template.id}, ${input.profileId}, ${expiresAt})
    RETURNING id
  `;
  const attemptId = attempts[0]?.id;
  if (!attemptId) throw conflict('Could not start the simulation.');

  await track({
    event: 'simulation_started',
    userId: input.userId,
    role: 'WORKER',
    entityType: 'simulation_template',
    entityId: template.id,
    properties: { slug: template.slug, category: template.category },
  });

  const attempt = await getAttempt(attemptId);
  if (!attempt) throw conflict('Could not load the simulation.');
  return attempt;
}

export async function getAttempt(attemptId: string, db: Db = sql): Promise<AttemptRow | null> {
  const rows = await db<AttemptRow[]>`${ATTEMPT_SELECT} WHERE sa.id = ${attemptId}`;
  return rows[0] ?? null;
}

/**
 * Submit and evaluate an attempt.
 *
 * On a valid, sufficiently strong result the demonstrated skills are promoted
 * to SIMULATION_VERIFIED on the worker's profile, with the attempt recorded as
 * the supporting evidence, and readiness is recomputed.
 */
export async function submitAttempt(input: {
  attemptId: string;
  profileId: string;
  userId: string;
  response: string;
  structuredResponse?: Record<string, unknown>;
  timeSpentSeconds?: number;
}): Promise<AttemptRow> {
  const attempt = await getAttempt(input.attemptId);
  if (!attempt) throw notFound('Simulation attempt');
  if (attempt.worker_profile_id !== input.profileId) throw forbidden('That is not your simulation attempt.');
  if (attempt.state !== 'STARTED') throw conflict('This attempt has already been submitted.');

  await sql`
    UPDATE simulation_attempts
    SET state = 'SUBMITTED', response = ${input.response},
        structured_response = ${json(input.structuredResponse ?? {})},
        submitted_at = now(), time_spent_seconds = ${input.timeSpentSeconds ?? null}
    WHERE id = ${input.attemptId}
  `;

  const skillRows = await sql<{ slug: string }[]>`
    SELECT s.slug FROM simulation_template_skills sts
    JOIN skills s ON s.id = sts.skill_id
    WHERE sts.template_id = ${attempt.template_id}
  `;
  const skillSlugs = skillRows.map((r) => r.slug);

  const evaluation = await AIService.evaluateSimulation(
    {
      simulation: { title: attempt.title, brief: attempt.brief, materials: attempt.materials, rubric: attempt.rubric },
      rubric: attempt.rubric,
      response: input.response,
      structuredResponse: input.structuredResponse,
      skillSlugs,
    },
    { userId: input.userId },
  );

  const result = evaluation.data;
  const evaluatorVersion = `${evaluation.meta.provider}:${evaluation.meta.model}:${PROMPT_VERSIONS.evaluateSimulation}`;

  const assessmentId = await recordAssessment({
    kind: 'SIMULATION_EVALUATION',
    subjectUserId: input.userId,
    workerProfileId: input.profileId,
    entityType: 'simulation_attempt',
    entityId: input.attemptId,
    result,
    meta: evaluation.meta,
  });

  await withTransaction(async (tx) => {
    await tx`
      UPDATE simulation_attempts
      SET state = ${result.invalidAttempt ? 'ABANDONED' : 'EVALUATED'},
          score = ${result.invalidAttempt ? null : result.overallScore},
          criterion_scores = ${json(result.criterionScores)},
          strengths = ${result.strengths},
          weaknesses = ${result.weaknesses},
          feedback = ${result.feedback},
          evaluator_version = ${evaluatorVersion},
          evaluated_at = now()
      WHERE id = ${input.attemptId}
    `;

    // Promote demonstrated skills, citing this attempt as the evidence.
    if (!result.invalidAttempt) {
      for (const demonstrated of result.demonstratedSkills) {
        await upsertWorkerSkill(
          input.profileId,
          {
            skillSlug: demonstrated.skillSlug,
            assessedLevel: demonstrated.level,
            evidenceLevel: 'SIMULATION_VERIFIED',
            confidence: demonstrated.confidence,
            evidence: [
              {
                type: 'simulation',
                attemptId: input.attemptId,
                assessmentId,
                template: attempt.template_slug,
                score: result.overallScore,
                evaluatorVersion,
                at: new Date().toISOString(),
              },
            ],
            source: 'SIMULATION',
          },
          tx,
        );
      }
    }
  });

  await recomputeReadiness(input.profileId);

  if (!result.invalidAttempt) {
    const template = NOTIFICATIONS.simulationEvaluated(attempt.template_title, result.overallScore);
    await notify({ userId: input.userId, ...template, actionUrl: `/worker/simulations/${input.attemptId}` });
  }

  await track({
    event: 'simulation_completed',
    userId: input.userId,
    role: 'WORKER',
    entityType: 'simulation_attempt',
    entityId: input.attemptId,
    properties: {
      template: attempt.template_slug,
      score: result.invalidAttempt ? null : result.overallScore,
      invalid: result.invalidAttempt,
      skillsVerified: result.demonstratedSkills.length,
    },
  });

  const updated = await getAttempt(input.attemptId);
  if (!updated) throw conflict('Could not load the evaluated attempt.');
  return updated;
}

export async function listAttempts(profileId: string, db: Db = sql) {
  return db<
    Array<{
      id: string; state: string; score: number | null; started_at: Date; evaluated_at: Date | null;
      template_title: string; template_slug: string; category: string; strengths: string[]; weaknesses: string[];
    }>
  >`
    SELECT sa.id, sa.state::text, sa.score, sa.started_at, sa.evaluated_at,
           sa.strengths, sa.weaknesses,
           t.title AS template_title, t.slug AS template_slug, t.category
    FROM simulation_attempts sa
    JOIN simulation_templates t ON t.id = sa.template_id
    WHERE sa.worker_profile_id = ${profileId}
    ORDER BY sa.started_at DESC
  `;
}

/** Best score per template, used on profiles and in employer views. */
export async function bestScores(profileId: string, db: Db = sql) {
  return db<Array<{ template_slug: string; template_title: string; category: string; score: number; evaluated_at: Date }>>`
    SELECT DISTINCT ON (t.slug)
      t.slug AS template_slug, t.title AS template_title, t.category, sa.score, sa.evaluated_at
    FROM simulation_attempts sa
    JOIN simulation_templates t ON t.id = sa.template_id
    WHERE sa.worker_profile_id = ${profileId} AND sa.state = 'EVALUATED' AND sa.score IS NOT NULL
    ORDER BY t.slug, sa.score DESC
  `;
}

/** Expire stale started attempts. Called from a scheduled job. */
export async function expireStaleAttempts(): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE simulation_attempts SET state = 'EXPIRED'
    WHERE state = 'STARTED' AND expires_at < now()
    RETURNING id
  `;
  return rows.length;
}
