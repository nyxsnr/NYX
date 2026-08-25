/**
 * Worker domain service.
 *
 * Owns the worker profile, the capability ledger, and readiness recomputation.
 * Two rules run through everything here:
 *
 *   * evidence level is never upgraded implicitly — only a scored simulation
 *     or an employer confirmation may promote a skill past AI_INFERRED;
 *   * the public view of a profile is built by an explicit serializer, so a
 *     new private column can never leak by being added to a SELECT *.
 */
import 'server-only';
import { json, sql, withTransaction, type Db } from '@/lib/db/client';
import { notFound } from '@/lib/http/errors';
import { computeReadiness, type ReadinessResult, type ReadinessSnapshot } from '@/lib/readiness';
import type { EvidenceLevel, SkillLevel, WorkerMatchProfile, WorkerSkillSignal } from '@/lib/matching';
import { contentHash, hashingEmbed, workerEmbeddingText } from '@/lib/ai/embeddings';

export interface WorkerProfileRow {
  id: string;
  user_id: string;
  photo_url: string | null;
  headline: string | null;
  summary: string | null;
  region_id: string | null;
  region_name: string | null;
  town: string | null;
  age_bracket: string | null;
  education_level: string | null;
  field_of_study: string | null;
  years_experience: number;
  employment_status: string | null;
  languages: string[];
  interests: string[];
  has_smartphone: boolean;
  has_laptop: boolean;
  internet_access: 'NONE' | 'OCCASIONAL' | 'MOBILE_DATA' | 'BROADBAND';
  desired_income_min: string | null;
  desired_income_max: string | null;
  income_period: string;
  currency: string;
  preferred_work_types: string[];
  work_arrangement: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY';
  willing_to_relocate: boolean;
  hours_per_week: number | null;
  available_from: Date | null;
  is_available: boolean;
  open_to_discovery: boolean;
  readiness_score: number;
  readiness_components: unknown;
  readiness_computed_at: Date | null;
  profile_completion: number;
  jobs_completed: number;
  tasks_completed: number;
  completion_rate: string | null;
  cancellation_rate: string | null;
  on_time_rate: string | null;
  avg_rating: string | null;
  rating_count: number;
  response_rate: string | null;
  total_earned: string;
  is_searchable: boolean;
  show_phone: boolean;
  show_exact_location: boolean;
  show_earnings: boolean;
  onboarding_step: string;
  onboarding_completed_at: Date | null;
  full_name: string;
  email: string;
  phone: string | null;
  email_verified_at: Date | null;
  phone_verified_at: Date | null;
  is_demo: boolean;
}

const PROFILE_SELECT = sql`
  SELECT wp.*, r.name AS region_name,
         u.full_name, u.email, u.phone, u.email_verified_at, u.phone_verified_at, u.is_demo
  FROM worker_profiles wp
  JOIN users u ON u.id = wp.user_id
  LEFT JOIN regions r ON r.id = wp.region_id
`;

export async function getWorkerProfileByUserId(userId: string, db: Db = sql): Promise<WorkerProfileRow | null> {
  const rows = await db<WorkerProfileRow[]>`
    ${PROFILE_SELECT} WHERE wp.user_id = ${userId} AND wp.deleted_at IS NULL LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getWorkerProfileById(profileId: string, db: Db = sql): Promise<WorkerProfileRow | null> {
  const rows = await db<WorkerProfileRow[]>`
    ${PROFILE_SELECT} WHERE wp.id = ${profileId} AND wp.deleted_at IS NULL LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function requireWorkerProfile(userId: string, db: Db = sql): Promise<WorkerProfileRow> {
  const profile = await getWorkerProfileByUserId(userId, db);
  if (!profile) throw notFound('Worker profile');
  return profile;
}

/** Create the profile row that every worker account needs. */
export async function createWorkerProfile(userId: string, db: Db = sql): Promise<string> {
  const rows = await db<{ id: string }[]>`
    INSERT INTO worker_profiles (user_id) VALUES (${userId})
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
    RETURNING id
  `;
  return rows[0]?.id ?? '';
}

// ---------------------------------------------------------------------------
// Skills — the capability ledger
// ---------------------------------------------------------------------------

export interface WorkerSkillRow {
  id: string;
  skill_id: string;
  slug: string;
  name: string;
  category: string;
  demand_score: number;
  self_reported_level: SkillLevel | null;
  assessed_level: SkillLevel | null;
  evidence_level: EvidenceLevel;
  confidence: string | null;
  years_experience: number | null;
  evidence: unknown;
  source: string;
  last_verified_at: Date | null;
}

export async function listWorkerSkills(profileId: string, db: Db = sql): Promise<WorkerSkillRow[]> {
  return db<WorkerSkillRow[]>`
    SELECT ws.id, ws.skill_id, s.slug, s.name, s.category, s.demand_score,
           ws.self_reported_level, ws.assessed_level, ws.evidence_level, ws.confidence,
           ws.years_experience, ws.evidence, ws.source, ws.last_verified_at
    FROM worker_skills ws
    JOIN skills s ON s.id = ws.skill_id
    WHERE ws.worker_profile_id = ${profileId}
    ORDER BY
      CASE ws.evidence_level
        WHEN 'EMPLOYER_VERIFIED' THEN 0 WHEN 'SIMULATION_VERIFIED' THEN 1
        WHEN 'AI_INFERRED' THEN 2 ELSE 3
      END,
      s.demand_score DESC
  `;
}

const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
  SELF_REPORTED: 0,
  AI_INFERRED: 1,
  SIMULATION_VERIFIED: 2,
  EMPLOYER_VERIFIED: 3,
};

/**
 * Add or update a worker's skill.
 *
 * Evidence level only ever moves up. A later self-report cannot quietly
 * downgrade a simulation-verified skill, and — more importantly — an
 * AI inference can never overwrite proven evidence.
 */
export async function upsertWorkerSkill(
  profileId: string,
  input: {
    skillSlug: string;
    selfReportedLevel?: SkillLevel | null;
    assessedLevel?: SkillLevel | null;
    evidenceLevel: EvidenceLevel;
    confidence?: number | null;
    yearsExperience?: number | null;
    evidence?: unknown[];
    source: string;
  },
  db: Db = sql,
): Promise<boolean> {
  const skills = await db<{ id: string }[]>`SELECT id FROM skills WHERE slug = ${input.skillSlug} AND is_active`;
  const skill = skills[0];
  if (!skill) return false;

  const existing = await db<{ evidence_level: EvidenceLevel; evidence: unknown }[]>`
    SELECT evidence_level, evidence FROM worker_skills
    WHERE worker_profile_id = ${profileId} AND skill_id = ${skill.id}
  `;

  const current = existing[0];
  const nextEvidenceLevel =
    current && EVIDENCE_RANK[current.evidence_level] > EVIDENCE_RANK[input.evidenceLevel]
      ? current.evidence_level
      : input.evidenceLevel;

  // Evidence accumulates; it is never replaced, so the trail stays auditable.
  const priorEvidence = Array.isArray(current?.evidence) ? (current.evidence as unknown[]) : [];
  const mergedEvidence = [...priorEvidence, ...(input.evidence ?? [])].slice(-20);

  const isVerified = nextEvidenceLevel === 'SIMULATION_VERIFIED' || nextEvidenceLevel === 'EMPLOYER_VERIFIED';

  await db`
    INSERT INTO worker_skills (
      worker_profile_id, skill_id, self_reported_level, assessed_level,
      evidence_level, confidence, years_experience, evidence, source, last_verified_at
    ) VALUES (
      ${profileId}, ${skill.id}, ${input.selfReportedLevel ?? null}, ${input.assessedLevel ?? null},
      ${nextEvidenceLevel}, ${input.confidence ?? null}, ${input.yearsExperience ?? null},
      ${json(mergedEvidence)}, ${input.source},
      ${isVerified ? sql`now()` : null}
    )
    ON CONFLICT (worker_profile_id, skill_id) DO UPDATE SET
      self_reported_level = coalesce(EXCLUDED.self_reported_level, worker_skills.self_reported_level),
      assessed_level      = coalesce(EXCLUDED.assessed_level, worker_skills.assessed_level),
      evidence_level      = EXCLUDED.evidence_level,
      confidence          = coalesce(EXCLUDED.confidence, worker_skills.confidence),
      years_experience    = coalesce(EXCLUDED.years_experience, worker_skills.years_experience),
      evidence            = EXCLUDED.evidence,
      source              = EXCLUDED.source,
      last_verified_at    = coalesce(EXCLUDED.last_verified_at, worker_skills.last_verified_at),
      updated_at          = now()
  `;
  return true;
}

export async function removeWorkerSkill(profileId: string, skillSlug: string, db: Db = sql): Promise<boolean> {
  // Verified evidence is not deletable by the worker: allowing it would let
  // someone hide a poor result, which would make every good result meaningless.
  const rows = await db<{ id: string }[]>`
    DELETE FROM worker_skills ws
    USING skills s
    WHERE ws.skill_id = s.id
      AND ws.worker_profile_id = ${profileId}
      AND s.slug = ${skillSlug}
      AND ws.evidence_level IN ('SELF_REPORTED', 'AI_INFERRED')
    RETURNING ws.id
  `;
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

/** Gather everything the readiness engine needs, in one round trip. */
export async function buildReadinessSnapshot(profileId: string, db: Db = sql): Promise<ReadinessSnapshot> {
  const rows = await db<
    Array<{
      photo_url: string | null; headline: string | null; summary: string | null;
      region_id: string | null; education_level: string | null; languages: string[];
      desired_income_min: string | null; preferred_work_types: string[];
      years_experience: number; jobs_completed: number; tasks_completed: number;
      completion_rate: string | null; on_time_rate: string | null; cancellation_rate: string | null;
      avg_rating: string | null; rating_count: number; response_rate: string | null;
      email_verified_at: Date | null; phone_verified_at: Date | null;
      has_cv: boolean; skill_count: number; verified_skill_count: number;
      ai_inferred_skill_count: number; in_demand_skill_count: number;
      simulations_completed: number; best_simulation_score: number | null;
      average_simulation_score: string | null; portfolio_count: number;
      verified_portfolio_count: number; interviews_completed: number;
      best_interview_score: number | null; communication_score: number | null;
      disputes_lost: number;
    }>
  >`
    SELECT
      wp.photo_url, wp.headline, wp.summary, wp.region_id, wp.education_level, wp.languages,
      wp.desired_income_min, wp.preferred_work_types, wp.years_experience,
      wp.jobs_completed, wp.tasks_completed, wp.completion_rate, wp.on_time_rate,
      wp.cancellation_rate, wp.avg_rating, wp.rating_count, wp.response_rate,
      u.email_verified_at, u.phone_verified_at,

      EXISTS (SELECT 1 FROM cv_documents c WHERE c.worker_profile_id = wp.id) AS has_cv,

      (SELECT count(*)::int FROM worker_skills ws WHERE ws.worker_profile_id = wp.id) AS skill_count,
      (SELECT count(*)::int FROM worker_skills ws
         WHERE ws.worker_profile_id = wp.id
           AND ws.evidence_level IN ('SIMULATION_VERIFIED','EMPLOYER_VERIFIED')) AS verified_skill_count,
      (SELECT count(*)::int FROM worker_skills ws
         WHERE ws.worker_profile_id = wp.id AND ws.evidence_level = 'AI_INFERRED') AS ai_inferred_skill_count,
      (SELECT count(*)::int FROM worker_skills ws
         JOIN skills s ON s.id = ws.skill_id
         WHERE ws.worker_profile_id = wp.id AND s.demand_score >= 70) AS in_demand_skill_count,

      (SELECT count(*)::int FROM simulation_attempts sa
         WHERE sa.worker_profile_id = wp.id AND sa.state = 'EVALUATED') AS simulations_completed,
      (SELECT max(sa.score) FROM simulation_attempts sa
         WHERE sa.worker_profile_id = wp.id AND sa.state = 'EVALUATED') AS best_simulation_score,
      (SELECT avg(sa.score)::text FROM simulation_attempts sa
         WHERE sa.worker_profile_id = wp.id AND sa.state = 'EVALUATED') AS average_simulation_score,

      (SELECT count(*)::int FROM portfolio_items pi
         WHERE pi.worker_profile_id = wp.id AND pi.deleted_at IS NULL) AS portfolio_count,
      (SELECT count(*)::int FROM portfolio_items pi
         WHERE pi.worker_profile_id = wp.id AND pi.deleted_at IS NULL
           AND pi.evidence_level IN ('SIMULATION_VERIFIED','EMPLOYER_VERIFIED')) AS verified_portfolio_count,

      (SELECT count(*)::int FROM interview_sessions i
         WHERE i.worker_profile_id = wp.id AND i.state = 'COMPLETED') AS interviews_completed,
      (SELECT max(i.overall_score) FROM interview_sessions i
         WHERE i.worker_profile_id = wp.id AND i.state = 'COMPLETED') AS best_interview_score,

      (SELECT max((c->>'score')::int)
         FROM simulation_attempts sa, jsonb_array_elements(sa.criterion_scores) c
         WHERE sa.worker_profile_id = wp.id AND sa.state = 'EVALUATED'
           AND c->>'key' IN ('communication','clarity','tone','grammar')) AS communication_score,

      (SELECT count(*)::int FROM disputes d
         WHERE d.against_user_id = wp.user_id AND d.status = 'RESOLVED_EMPLOYER') AS disputes_lost
    FROM worker_profiles wp
    JOIN users u ON u.id = wp.user_id
    WHERE wp.id = ${profileId}
  `;

  const r = rows[0];
  if (!r) throw notFound('Worker profile');

  const num = (v: string | null) => (v === null ? null : Number(v));

  return {
    hasPhoto: Boolean(r.photo_url),
    hasHeadline: Boolean(r.headline),
    hasSummary: Boolean(r.summary && r.summary.length > 40),
    hasLocation: Boolean(r.region_id),
    hasEducation: Boolean(r.education_level),
    hasLanguages: r.languages.length > 0,
    hasDesiredIncome: r.desired_income_min !== null,
    hasWorkPreferences: r.preferred_work_types.length > 0,
    hasCv: r.has_cv,
    emailVerified: Boolean(r.email_verified_at),
    phoneVerified: Boolean(r.phone_verified_at),

    skillCount: r.skill_count,
    verifiedSkillCount: r.verified_skill_count,
    aiInferredSkillCount: r.ai_inferred_skill_count,
    inDemandSkillCount: r.in_demand_skill_count,

    simulationsCompleted: r.simulations_completed,
    bestSimulationScore: r.best_simulation_score,
    averageSimulationScore: r.average_simulation_score ? Math.round(Number(r.average_simulation_score)) : null,
    portfolioItemCount: r.portfolio_count,
    verifiedPortfolioItemCount: r.verified_portfolio_count,

    interviewsCompleted: r.interviews_completed,
    bestInterviewScore: r.best_interview_score,
    writtenCommunicationScore: r.communication_score,

    yearsExperience: r.years_experience,
    jobsCompleted: r.jobs_completed,
    tasksCompleted: r.tasks_completed,
    completionRate: num(r.completion_rate),
    onTimeRate: num(r.on_time_rate),
    cancellationRate: num(r.cancellation_rate),
    averageEmployerRating: num(r.avg_rating),
    ratingCount: r.rating_count,
    averageQualityRating: null,
    responseRate: num(r.response_rate),
    disputesLost: r.disputes_lost,
  };
}

/** Recompute and persist the readiness snapshot. */
export async function recomputeReadiness(profileId: string, db: Db = sql): Promise<ReadinessResult> {
  const snapshot = await buildReadinessSnapshot(profileId, db);
  const result = computeReadiness(snapshot);
  const completion =
    result.components.find((c) => c.key === 'profileCompleteness')?.score ?? 0;

  await db`
    UPDATE worker_profiles
    SET readiness_score = ${result.score},
        readiness_components = ${json(result)},
        readiness_computed_at = now(),
        profile_completion = ${Math.round(completion)}
    WHERE id = ${profileId}
  `;

  return result;
}

/** Read the cached readiness result, recomputing when stale or absent. */
export async function getReadiness(profileId: string, maxAgeMinutes = 15): Promise<ReadinessResult> {
  const rows = await sql<{ readiness_components: unknown; readiness_computed_at: Date | null }[]>`
    SELECT readiness_components, readiness_computed_at FROM worker_profiles WHERE id = ${profileId}
  `;
  const row = rows[0];
  if (!row) throw notFound('Worker profile');

  const fresh =
    row.readiness_computed_at &&
    Date.now() - row.readiness_computed_at.getTime() < maxAgeMinutes * 60_000;

  const cached = row.readiness_components as ReadinessResult | null;
  if (fresh && cached && typeof cached.score === 'number' && Array.isArray(cached.components)) {
    return cached;
  }
  return recomputeReadiness(profileId);
}

// ---------------------------------------------------------------------------
// Matching profile
// ---------------------------------------------------------------------------

/** Assemble the input the matching engine needs for one worker. */
export async function buildMatchProfile(profileId: string, db: Db = sql): Promise<WorkerMatchProfile> {
  const profile = await getWorkerProfileById(profileId, db);
  if (!profile) throw notFound('Worker profile');

  const skillRows = await db<
    Array<{ slug: string; assessed_level: SkillLevel | null; self_reported_level: SkillLevel | null; evidence_level: EvidenceLevel; best_score: number | null }>
  >`
    SELECT s.slug, ws.assessed_level, ws.self_reported_level, ws.evidence_level,
           (SELECT max(sa.score)
              FROM simulation_attempts sa
              JOIN simulation_template_skills sts ON sts.template_id = sa.template_id
             WHERE sa.worker_profile_id = ${profileId}
               AND sa.state = 'EVALUATED'
               AND sts.skill_id = ws.skill_id) AS best_score
    FROM worker_skills ws
    JOIN skills s ON s.id = ws.skill_id
    WHERE ws.worker_profile_id = ${profileId}
  `;

  const skills: WorkerSkillSignal[] = skillRows.map((r) => ({
    skillSlug: r.slug,
    level: r.assessed_level ?? r.self_reported_level,
    evidenceLevel: r.evidence_level,
    simulationScore: r.best_score,
  }));

  const embeddingRows = await db<{ embedding: number[] }[]>`
    SELECT embedding FROM embeddings WHERE entity_type = 'worker' AND entity_id = ${profileId}
  `;

  return {
    skills,
    yearsExperience: profile.years_experience,
    educationLevel: profile.education_level,
    regionId: profile.region_id,
    regionName: profile.region_name,
    workArrangement: profile.work_arrangement,
    preferredWorkTypes: profile.preferred_work_types,
    desiredIncomeMin: profile.desired_income_min ? Number(profile.desired_income_min) : null,
    desiredIncomeMax: profile.desired_income_max ? Number(profile.desired_income_max) : null,
    incomePeriod: profile.income_period,
    languages: profile.languages,
    hasLaptop: profile.has_laptop,
    internetAccess: profile.internet_access,
    isAvailable: profile.is_available,
    hoursPerWeek: profile.hours_per_week,
    completionRate: profile.completion_rate ? Number(profile.completion_rate) : null,
    averageRating: profile.avg_rating ? Number(profile.avg_rating) : null,
    ratingCount: profile.rating_count,
    tasksCompleted: profile.tasks_completed,
    readinessScore: profile.readiness_score,
    embedding: embeddingRows[0]?.embedding ?? null,
  };
}

/** Refresh the worker's matching embedding when their profile text changes. */
export async function refreshWorkerEmbedding(profileId: string, db: Db = sql): Promise<void> {
  const profile = await getWorkerProfileById(profileId, db);
  if (!profile) return;

  const skills = await listWorkerSkills(profileId, db);
  const text = workerEmbeddingText({
    headline: profile.headline,
    summary: profile.summary,
    skills: skills.map((s) => s.name),
    interests: profile.interests,
  });

  const hash = contentHash(text);
  const existing = await db<{ content_hash: string }[]>`
    SELECT content_hash FROM embeddings WHERE entity_type = 'worker' AND entity_id = ${profileId}
  `;
  if (existing[0]?.content_hash === hash) return;

  const vector = hashingEmbed(text);
  await db`
    INSERT INTO embeddings (entity_type, entity_id, content_hash, embedding, dimensions, model)
    VALUES ('worker', ${profileId}, ${hash}, ${vector}::float8[], ${vector.length}, 'kazios-hashing-v1')
    ON CONFLICT (entity_type, entity_id) DO UPDATE SET
      content_hash = EXCLUDED.content_hash,
      embedding = EXCLUDED.embedding,
      dimensions = EXCLUDED.dimensions,
      model = EXCLUDED.model,
      updated_at = now()
  `;
}

// ---------------------------------------------------------------------------
// Serializers — the only place profile data crosses a trust boundary
// ---------------------------------------------------------------------------

/** Everything the worker themselves may see. */
export function serializeOwnProfile(profile: WorkerProfileRow, skills: WorkerSkillRow[]) {
  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    emailVerified: Boolean(profile.email_verified_at),
    phoneVerified: Boolean(profile.phone_verified_at),
    photoUrl: profile.photo_url,
    headline: profile.headline,
    summary: profile.summary,
    regionId: profile.region_id,
    regionName: profile.region_name,
    town: profile.town,
    ageBracket: profile.age_bracket,
    educationLevel: profile.education_level,
    fieldOfStudy: profile.field_of_study,
    yearsExperience: profile.years_experience,
    employmentStatus: profile.employment_status,
    languages: profile.languages,
    interests: profile.interests,
    hasSmartphone: profile.has_smartphone,
    hasLaptop: profile.has_laptop,
    internetAccess: profile.internet_access,
    desiredIncomeMin: profile.desired_income_min ? Number(profile.desired_income_min) : null,
    desiredIncomeMax: profile.desired_income_max ? Number(profile.desired_income_max) : null,
    incomePeriod: profile.income_period,
    currency: profile.currency,
    preferredWorkTypes: profile.preferred_work_types,
    workArrangement: profile.work_arrangement,
    willingToRelocate: profile.willing_to_relocate,
    hoursPerWeek: profile.hours_per_week,
    availableFrom: profile.available_from,
    isAvailable: profile.is_available,
    openToDiscovery: profile.open_to_discovery,
    readinessScore: profile.readiness_score,
    profileCompletion: profile.profile_completion,
    jobsCompleted: profile.jobs_completed,
    tasksCompleted: profile.tasks_completed,
    avgRating: profile.avg_rating ? Number(profile.avg_rating) : null,
    ratingCount: profile.rating_count,
    totalEarned: Number(profile.total_earned),
    privacy: {
      isSearchable: profile.is_searchable,
      showPhone: profile.show_phone,
      showExactLocation: profile.show_exact_location,
      showEarnings: profile.show_earnings,
    },
    onboardingStep: profile.onboarding_step,
    onboardingCompletedAt: profile.onboarding_completed_at,
    isDemo: profile.is_demo,
    skills: skills.map(serializeSkill),
  };
}

export function serializeSkill(skill: WorkerSkillRow) {
  return {
    slug: skill.slug,
    name: skill.name,
    category: skill.category,
    demandScore: skill.demand_score,
    level: skill.assessed_level ?? skill.self_reported_level,
    selfReportedLevel: skill.self_reported_level,
    assessedLevel: skill.assessed_level,
    evidenceLevel: skill.evidence_level,
    confidence: skill.confidence ? Number(skill.confidence) : null,
    yearsExperience: skill.years_experience,
    lastVerifiedAt: skill.last_verified_at,
    /** Drives the badge shown next to every skill in the UI. */
    isVerified: skill.evidence_level === 'SIMULATION_VERIFIED' || skill.evidence_level === 'EMPLOYER_VERIFIED',
  };
}

/**
 * The public view, shown to employers and on shared profile links.
 *
 * Contact details, exact location and earnings are withheld unless the worker
 * has explicitly opted in. Age bracket and employment status are never
 * published: they are matching inputs, not public facts, and publishing them
 * would invite exactly the discrimination the platform refuses to model.
 */
export function serializePublicProfile(
  profile: WorkerProfileRow,
  skills: WorkerSkillRow[],
  options: { viewerIsEmployer?: boolean } = {},
) {
  const verifiedSkills = skills.filter(
    (s) => s.evidence_level === 'SIMULATION_VERIFIED' || s.evidence_level === 'EMPLOYER_VERIFIED',
  );

  return {
    id: profile.id,
    // First name plus surname initial until an employer engages, so a public
    // link cannot be scraped into a directory of full names.
    displayName: options.viewerIsEmployer
      ? profile.full_name
      : abbreviateName(profile.full_name),
    photoUrl: profile.photo_url,
    headline: profile.headline,
    summary: profile.summary,
    location: profile.show_exact_location
      ? [profile.town, profile.region_name].filter(Boolean).join(', ')
      : (profile.region_name ?? 'Kenya'),
    phone: profile.show_phone && options.viewerIsEmployer ? profile.phone : null,
    yearsExperience: profile.years_experience,
    educationLevel: profile.education_level,
    languages: profile.languages,
    workArrangement: profile.work_arrangement,
    preferredWorkTypes: profile.preferred_work_types,
    isAvailable: profile.is_available,
    hoursPerWeek: profile.hours_per_week,
    readinessScore: profile.readiness_score,
    skills: skills.map(serializeSkill),
    verifiedSkillCount: verifiedSkills.length,
    jobsCompleted: profile.jobs_completed,
    tasksCompleted: profile.tasks_completed,
    completionRate: profile.completion_rate ? Number(profile.completion_rate) : null,
    // Withheld below the sufficient-data threshold by the reputation engine.
    rating: profile.rating_count >= 3 && profile.avg_rating ? Number(profile.avg_rating) : null,
    ratingCount: profile.rating_count,
    totalEarned: profile.show_earnings ? Number(profile.total_earned) : null,
    isDemo: profile.is_demo,
  };
}

function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0] as string;
  return `${parts[0]} ${(parts[parts.length - 1] as string).charAt(0)}.`;
}

/** Recompute the denormalised reputation columns from source data. */
export async function refreshWorkerStats(profileId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx`
      UPDATE worker_profiles wp
      SET
        tasks_completed = stats.completed,
        completion_rate = CASE WHEN stats.started > 0
          THEN round(stats.completed::numeric * 100 / stats.started, 2) END,
        cancellation_rate = CASE WHEN stats.started > 0
          THEN round(stats.cancelled::numeric * 100 / stats.started, 2) END,
        on_time_rate = CASE WHEN stats.with_deadline > 0
          THEN round(stats.on_time::numeric * 100 / stats.with_deadline, 2) END,
        avg_rating = reviews.avg_rating,
        rating_count = reviews.rating_count
      FROM (
        SELECT
          count(*)                                                  AS started,
          count(*) FILTER (WHERE status = 'APPROVED')               AS completed,
          count(*) FILTER (WHERE status = 'CANCELLED')              AS cancelled,
          count(*) FILTER (WHERE due_at IS NOT NULL)                AS with_deadline,
          count(*) FILTER (WHERE due_at IS NOT NULL AND completed_at IS NOT NULL AND completed_at <= due_at) AS on_time
        FROM task_assignments WHERE worker_profile_id = ${profileId}
      ) stats,
      (
        SELECT round(avg(r.rating), 2) AS avg_rating, count(*)::int AS rating_count
        FROM reviews r
        JOIN worker_profiles w ON w.user_id = r.subject_user_id
        WHERE w.id = ${profileId} AND r.deleted_at IS NULL AND r.is_published AND NOT r.is_flagged
      ) reviews
      WHERE wp.id = ${profileId}
    `;
  });
}
