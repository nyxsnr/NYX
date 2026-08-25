/**
 * Seed the database with demo data.
 *
 * Everything created here is flagged `is_demo = true` and surfaced with a
 * visible "Demo data" marker, so seeded content can never be mistaken for a
 * real person, employer or vacancy.
 *
 * The seed exercises the real code paths — the same wallet ledger, the same
 * matching engine, the same evidence rules — so the demo environment behaves
 * exactly like production rather than being a set of pretty fixtures.
 *
 *   npm run db:seed
 *   npm run db:seed -- --reset   (clears existing demo data first)
 */
import postgres from 'postgres';
import { loadEnv } from './lib/load-env';
import { hashPassword } from '../src/lib/auth/password';
import { computeMatch, type WorkerMatchProfile } from '../src/lib/matching';
import { computeReadiness, type ReadinessSnapshot } from '../src/lib/readiness';
import { hashingEmbed, contentHash, opportunityEmbeddingText, workerEmbeddingText } from '../src/lib/ai/embeddings';
import { DEMO_WORKERS } from '../db/seed/data';
import { DEMO_EMPLOYERS, DEMO_JOBS, DEMO_TASKS } from '../db/seed/employers';

loadEnv();

type Sql = postgres.Sql<Record<string, never>>;

/**
 * Wrap a value bound for a jsonb column.
 *
 * postgres.js serialises jsonb parameters itself, so passing a pre-stringified
 * value would store a JSON string rather than an object. This mirrors the
 * `json` helper in src/lib/db/client.ts, bound to this script's own client.
 */
let sqlHelpers: Sql;
const json = (value: unknown) => sqlHelpers.json(value as never);

const kes = (amount: number) => Math.round(amount * 100);

/** Deterministic pseudo-random so re-seeding produces the same demo world. */
function seeded(seed: string, max: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % max;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production.');
  }

  const password = process.env.SEED_DEMO_PASSWORD ?? 'KaziOS-demo-2025';
  const sql = postgres(url, { max: 1, ssl: process.env.DATABASE_SSL === 'require' ? 'require' : false });
  sqlHelpers = sql;

  try {
    if (process.argv.includes('--reset')) {
      console.log('  clearing existing demo data ...');
      await clearDemoData(sql);
    }

    const passwordHash = await hashPassword(password);

    // --- Regions and skills lookups ----------------------------------------
    const regionRows = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM regions WHERE country_code = 'KE'
    `;
    const regionByName = new Map(regionRows.map((r) => [r.name, r.id]));

    const skillRows = await sql<{ id: string; slug: string }[]>`SELECT id, slug FROM skills`;
    const skillBySlug = new Map(skillRows.map((s) => [s.slug, s.id]));

    const templateRows = await sql<{ id: string; slug: string; rubric: unknown[]; title: string }[]>`
      SELECT id, slug, rubric, title FROM simulation_templates
    `;
    const templateBySlug = new Map(templateRows.map((t) => [t.slug, t]));

    // --- Admin -------------------------------------------------------------
    console.log('  creating admin ...');
    await upsertUser(sql, {
      email: 'demo-admin@example.com',
      fullName: 'Amina Kariuki',
      phone: '+254733999999',
      role: 'ADMIN',
      passwordHash,
      verified: true,
    });

    // --- Workers -----------------------------------------------------------
    console.log(`  creating ${DEMO_WORKERS.length} workers ...`);
    const workerProfiles = new Map<string, { userId: string; profileId: string }>();

    for (const worker of DEMO_WORKERS) {
      const userId = await upsertUser(sql, {
        email: worker.email,
        fullName: worker.fullName,
        phone: worker.phone,
        role: 'WORKER',
        passwordHash,
        verified: true,
      });

      const profiles = await sql<{ id: string }[]>`
        INSERT INTO worker_profiles (
          user_id, headline, summary, region_id, town, age_bracket, education_level,
          field_of_study, years_experience, employment_status, languages, interests,
          has_smartphone, has_laptop, internet_access, desired_income_min, desired_income_max,
          income_period, preferred_work_types, work_arrangement, open_to_discovery,
          is_available, onboarding_step, onboarding_completed_at
        ) VALUES (
          ${userId}, ${worker.headline}, ${worker.summary},
          ${regionByName.get(worker.county) ?? null}, ${worker.town}, ${worker.ageBracket},
          ${worker.education}::education_level, ${worker.fieldOfStudy ?? null},
          ${worker.yearsExperience}, ${worker.employmentStatus}::employment_status,
          ${worker.languages}, ${worker.interests}, true, ${worker.hasLaptop},
          ${worker.internetAccess}, ${kes(worker.desiredIncomeKes)}, ${kes(worker.desiredIncomeKes * 1.4)},
          'MONTHLY', ${worker.preferredWorkTypes}::employment_type[],
          ${worker.workArrangement}::work_arrangement, ${worker.openToDiscovery ?? false},
          true, 'DONE', now() - (${seeded(worker.email, 60)}::text || ' days')::interval
        )
        ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
        RETURNING id
      `;
      const profileId = profiles[0]?.id;
      if (!profileId) continue;
      workerProfiles.set(worker.email, { userId, profileId });

      // Self-reported skills: the weakest evidence tier, exactly as a real
      // onboarding would create them.
      for (const skill of worker.skills) {
        const skillId = skillBySlug.get(skill.slug);
        if (!skillId) continue;
        await sql`
          INSERT INTO worker_skills (worker_profile_id, skill_id, self_reported_level, evidence_level, source)
          VALUES (${profileId}, ${skillId}, ${skill.level}::skill_level, 'SELF_REPORTED', 'ONBOARDING')
          ON CONFLICT (worker_profile_id, skill_id) DO NOTHING
        `;
      }

      if (worker.cvText) {
        await sql`
          INSERT INTO cv_documents (worker_profile_id, raw_text, parse_state, is_primary)
          VALUES (${profileId}, ${worker.cvText}, 'PARSED', true)
        `;
      }

      // Simulation results promote skills to SIMULATION_VERIFIED, through the
      // same evidence rules the live evaluator uses.
      for (const result of worker.provenSimulations ?? []) {
        const template = templateBySlug.get(result.slug);
        if (!template) continue;
        await seedSimulationAttempt(sql, {
          profileId,
          template,
          score: result.score,
          skillBySlug,
        });
      }

      await refreshEmbedding(sql, 'worker', profileId, workerEmbeddingText({
        headline: worker.headline,
        summary: worker.summary,
        skills: worker.skills.map((s) => s.slug.replace(/-/g, ' ')),
        interests: worker.interests,
      }));

      await recomputeSeedReadiness(sql, profileId);
    }

    // --- Employers ---------------------------------------------------------
    console.log(`  creating ${DEMO_EMPLOYERS.length} employers ...`);
    const companies = new Map<string, { companyId: string; userId: string }>();

    for (const employer of DEMO_EMPLOYERS) {
      const userId = await upsertUser(sql, {
        email: employer.email,
        fullName: employer.contactName,
        phone: employer.phone,
        role: 'EMPLOYER',
        passwordHash,
        verified: true,
      });

      const slug = `${employer.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-demo`;
      const companyRows = await sql<{ id: string }[]>`
        INSERT INTO companies (
          name, slug, description, industry, size_bracket, website, region_id, town,
          verification_tier, verified_at, is_demo
        ) VALUES (
          ${employer.companyName}, ${slug}, ${employer.description}, ${employer.industry},
          ${employer.sizeBracket}, ${employer.website ?? null},
          ${regionByName.get(employer.county) ?? null}, ${employer.town},
          ${employer.verificationTier}::employer_verification_tier,
          ${employer.verificationTier === 'UNVERIFIED' ? null : sql`now()`}, true
        )
        ON CONFLICT (slug) DO UPDATE SET updated_at = now()
        RETURNING id
      `;
      const companyId = companyRows[0]?.id;
      if (!companyId) continue;

      await sql`
        INSERT INTO employer_profiles (user_id, company_id, job_title, onboarding_completed_at)
        VALUES (${userId}, ${companyId}, 'Operations Manager', now())
        ON CONFLICT (user_id) DO UPDATE SET company_id = EXCLUDED.company_id
      `;

      // Employers are funded so escrow flows work end-to-end in the demo.
      await creditWallet(sql, userId, 'EMPLOYER', kes(500_000), 'Demo balance for evaluation');

      companies.set(employer.companyName, { companyId, userId });
    }

    // --- Jobs --------------------------------------------------------------
    console.log(`  creating ${DEMO_JOBS.length} jobs ...`);
    const jobIds: string[] = [];

    for (const [index, job] of DEMO_JOBS.entries()) {
      const company = companies.get(job.company);
      if (!company) continue;

      const rows = await sql<{ id: string }[]>`
        INSERT INTO jobs (
          company_id, posted_by, title, slug, description, responsibilities, category,
          region_id, town, work_arrangement, employment_type,
          salary_min, salary_max, salary_period, salary_is_public,
          min_education, min_years_experience, openings, deadline,
          status, published_at, is_demo
        ) VALUES (
          ${company.companyId}, ${company.userId}, ${job.title},
          ${`${job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`},
          ${job.description}, ${job.responsibilities}, ${job.category},
          ${regionByName.get(job.county) ?? null}, ${job.town ?? null},
          ${job.workArrangement}::work_arrangement, ${job.employmentType}::employment_type,
          ${kes(job.salaryMinKes)}, ${kes(job.salaryMaxKes)}, ${job.salaryPeriod ?? 'MONTHLY'}, true,
          ${job.minEducation ?? null}::education_level, ${job.minYearsExperience},
          ${job.openings ?? 1},
          current_date + (${20 + seeded(job.title, 40)}::text || ' days')::interval,
          'PUBLISHED', now() - (${seeded(job.title, 30)}::text || ' days')::interval, true
        )
        ON CONFLICT (company_id, slug) DO UPDATE SET updated_at = now()
        RETURNING id
      `;
      const jobId = rows[0]?.id;
      if (!jobId) continue;
      jobIds.push(jobId);

      for (const slug of job.requiredSkills) {
        const skillId = skillBySlug.get(slug);
        if (skillId) {
          await sql`
            INSERT INTO job_skills (job_id, skill_id, is_required) VALUES (${jobId}, ${skillId}, true)
            ON CONFLICT DO NOTHING
          `;
        }
      }
      for (const slug of job.preferredSkills ?? []) {
        const skillId = skillBySlug.get(slug);
        if (skillId) {
          await sql`
            INSERT INTO job_skills (job_id, skill_id, is_required) VALUES (${jobId}, ${skillId}, false)
            ON CONFLICT DO NOTHING
          `;
        }
      }

      await refreshEmbedding(sql, 'job', jobId, opportunityEmbeddingText({
        title: job.title,
        description: job.description,
        category: job.category,
        skills: job.requiredSkills,
      }));
    }

    await sql`
      UPDATE companies c SET jobs_posted = (SELECT count(*) FROM jobs j WHERE j.company_id = c.id)
      WHERE c.is_demo
    `;

    // --- Tasks -------------------------------------------------------------
    console.log(`  creating ${DEMO_TASKS.length} tasks ...`);
    const taskIds: string[] = [];

    for (const task of DEMO_TASKS) {
      const company = companies.get(task.company);
      if (!company) continue;

      const rows = await sql<{ id: string }[]>`
        INSERT INTO tasks (
          company_id, posted_by, title, description, category, expected_output,
          quality_requirements, budget_amount, workers_needed, estimated_hours,
          deadline, requires_laptop, status, published_at, is_demo
        ) VALUES (
          ${company.companyId}, ${company.userId}, ${task.title}, ${task.description},
          ${task.category}, ${task.expectedOutput}, ${task.qualityRequirements ?? null},
          ${kes(task.budgetKes)}, ${task.workersNeeded ?? 1}, ${task.estimatedHours},
          now() + (${task.daysUntilDeadline ?? 14}::text || ' days')::interval,
          ${task.requiresLaptop ?? false}, 'PUBLISHED',
          now() - (${seeded(task.title, 14)}::text || ' days')::interval, true
        )
        RETURNING id
      `;
      const taskId = rows[0]?.id;
      if (!taskId) continue;
      taskIds.push(taskId);

      for (const slug of task.requiredSkills) {
        const skillId = skillBySlug.get(slug);
        if (skillId) {
          await sql`
            INSERT INTO task_skills (task_id, skill_id, is_required) VALUES (${taskId}, ${skillId}, true)
            ON CONFLICT DO NOTHING
          `;
        }
      }

      await refreshEmbedding(sql, 'task', taskId, opportunityEmbeddingText({
        title: task.title,
        description: task.description,
        category: task.category,
        skills: task.requiredSkills,
        expectedOutput: task.expectedOutput,
      }));
    }

    await sql`
      UPDATE companies c SET tasks_posted = (SELECT count(*) FROM tasks t WHERE t.company_id = c.id)
      WHERE c.is_demo
    `;

    // --- Applications, with real match scores ------------------------------
    console.log('  creating applications with computed match scores ...');
    const applicationCount = await seedApplications(sql, workerProfiles, jobIds, taskIds);

    // --- Completed work, payments and reviews ------------------------------
    console.log('  creating completed work and payments ...');
    const completed = await seedCompletedWork(sql, workerProfiles, taskIds);

    // --- Recompute derived state -------------------------------------------
    for (const { profileId } of workerProfiles.values()) {
      await recomputeSeedReadiness(sql, profileId);
    }

    const summary = await sql<{ workers: string; employers: string; jobs: string; tasks: string; income: string }[]>`
      SELECT
        (SELECT count(*)::text FROM users WHERE role = 'WORKER' AND is_demo) AS workers,
        (SELECT count(*)::text FROM users WHERE role = 'EMPLOYER' AND is_demo) AS employers,
        (SELECT count(*)::text FROM jobs WHERE is_demo) AS jobs,
        (SELECT count(*)::text FROM tasks WHERE is_demo) AS tasks,
        (SELECT coalesce(sum(net_amount), 0)::text FROM payments WHERE status = 'RELEASED') AS income
    `;

    const s = summary[0];
    console.log(`
Seed complete.

  Workers          ${s?.workers}
  Employers        ${s?.employers}
  Jobs             ${s?.jobs}
  Tasks            ${s?.tasks}
  Applications     ${applicationCount}
  Completed work   ${completed}
  Worker income    KES ${(Number(s?.income ?? 0) / 100).toLocaleString('en-KE')}

Demo accounts (development only — password: ${password}):

  demo-worker@example.com     Grace Wanjiru, worker with verified evidence
  demo-employer@example.com   Diana Kilonzo, Sokoni Online (business verified)
  demo-admin@example.com      Amina Kariuki, platform administrator
`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertUser(
  sql: Sql,
  input: { email: string; fullName: string; phone: string; role: string; passwordHash: string; verified: boolean },
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO users (
      email, email_normalized, password_hash, role, status, full_name, phone, phone_normalized,
      email_verified_at, phone_verified_at, last_login_at, is_demo
    ) VALUES (
      ${input.email}, ${input.email.toLowerCase()}, ${input.passwordHash}, ${input.role}::user_role,
      'ACTIVE', ${input.fullName}, ${input.phone}, ${input.phone},
      ${input.verified ? sql`now()` : null}, ${input.verified ? sql`now()` : null},
      now() - (${seeded(input.email, 10)}::text || ' days')::interval, true
    )
    ON CONFLICT (email_normalized) WHERE deleted_at IS NULL
      DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error(`Could not create user ${input.email}`);
  return id;
}

/** Credit a wallet through the same ledger shape the application writes. */
async function creditWallet(sql: Sql, userId: string, kind: string, amount: number, description: string) {
  const wallets = await sql<{ id: string; balance_available: string }[]>`
    INSERT INTO wallets (owner_id, kind, currency) VALUES (${userId}, ${kind}, 'KES')
    ON CONFLICT (owner_id, currency) WHERE owner_id IS NOT NULL
      DO UPDATE SET updated_at = now()
    RETURNING id, balance_available
  `;
  const wallet = wallets[0];
  if (!wallet) return;

  // Only fund once, so re-running the seed does not inflate demo balances.
  if (Number(wallet.balance_available) > 0) return;

  const updated = await sql<{ balance_available: string }[]>`
    UPDATE wallets SET balance_available = balance_available + ${amount} WHERE id = ${wallet.id}
    RETURNING balance_available
  `;
  await sql`
    INSERT INTO transactions (wallet_id, kind, direction, amount, currency, balance_after, description, metadata)
    VALUES (${wallet.id}, 'DEPOSIT', 'CREDIT', ${amount}, 'KES',
            ${Number(updated[0]?.balance_available ?? amount)}, ${description},
            ${json({ bucket: 'available', demo: true })})
  `;
}

async function refreshEmbedding(sql: Sql, kind: string, entityId: string, text: string) {
  const vector = hashingEmbed(text);
  await sql`
    INSERT INTO embeddings (entity_type, entity_id, content_hash, embedding, dimensions, model)
    VALUES (${kind}, ${entityId}, ${contentHash(text)}, ${vector}::float8[], ${vector.length}, 'kazios-hashing-v1')
    ON CONFLICT (entity_type, entity_id) DO UPDATE SET
      content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding, updated_at = now()
  `;
}

/**
 * Create an evaluated simulation attempt and promote the skills it evidences.
 * Mirrors what src/lib/domain/simulations.ts does at runtime.
 */
async function seedSimulationAttempt(
  sql: Sql,
  input: {
    profileId: string;
    template: { id: string; slug: string; rubric: unknown[]; title: string };
    score: number;
    skillBySlug: Map<string, string>;
  },
) {
  const simulations = await sql<{ id: string }[]>`
    INSERT INTO simulations (template_id, title, brief, materials, rubric, generator_version)
    VALUES (
      ${input.template.id}, ${input.template.title},
      ${'Demo simulation instance generated for seed data.'},
      ${json({ demo: true })},
      ${json(input.template.rubric)},
      'seed:demo'
    )
    RETURNING id
  `;
  const simulationId = simulations[0]?.id;
  if (!simulationId) return;

  const rubric = input.template.rubric as Array<{ key?: string; label?: string }>;
  const criterionScores = rubric.map((criterion, index) => ({
    key: criterion.key ?? `criterion_${index}`,
    label: criterion.label ?? 'Criterion',
    score: Math.max(0, Math.min(100, input.score + ((index % 3) - 1) * 5)),
    evidence: 'Demo evaluation generated by the seed script.',
  }));

  const attempts = await sql<{ id: string }[]>`
    INSERT INTO simulation_attempts (
      simulation_id, template_id, worker_profile_id, state, response,
      score, criterion_scores, strengths, weaknesses, feedback, evaluator_version,
      started_at, submitted_at, evaluated_at, time_spent_seconds
    ) VALUES (
      ${simulationId}, ${input.template.id}, ${input.profileId}, 'EVALUATED',
      ${'Demo response recorded by the seed script.'},
      ${input.score}, ${json(criterionScores)},
      ${['Clear structure', 'Explained their reasoning']},
      ${input.score >= 85 ? [] : ['Could quantify outcomes more precisely']},
      ${`Scored ${input.score}/100 in this demo simulation.`},
      'seed:demo',
      now() - interval '20 days', now() - interval '20 days', now() - interval '20 days', 1500
    )
    RETURNING id
  `;
  const attemptId = attempts[0]?.id;
  if (!attemptId) return;

  // Promote the template's skills, respecting the evidence ladder.
  const templateSkills = await sql<{ slug: string }[]>`
    SELECT s.slug FROM simulation_template_skills sts
    JOIN skills s ON s.id = sts.skill_id
    WHERE sts.template_id = ${input.template.id}
  `;

  const level = input.score >= 85 ? 'ADVANCED' : input.score >= 70 ? 'INTERMEDIATE' : 'BEGINNER';

  for (const { slug } of templateSkills) {
    const skillId = input.skillBySlug.get(slug);
    if (!skillId) continue;
    await sql`
      INSERT INTO worker_skills (
        worker_profile_id, skill_id, assessed_level, evidence_level, confidence, evidence, source, last_verified_at
      ) VALUES (
        ${input.profileId}, ${skillId}, ${level}::skill_level, 'SIMULATION_VERIFIED',
        ${Math.min(0.95, input.score / 100)},
        ${json([{ type: 'simulation', attemptId, template: input.template.slug, score: input.score }])},
        'SIMULATION', now()
      )
      ON CONFLICT (worker_profile_id, skill_id) DO UPDATE SET
        assessed_level = EXCLUDED.assessed_level,
        evidence_level = 'SIMULATION_VERIFIED',
        confidence = EXCLUDED.confidence,
        evidence = EXCLUDED.evidence,
        source = 'SIMULATION',
        last_verified_at = now()
    `;
  }
}

/** Compute readiness through the real engine and persist it. */
async function recomputeSeedReadiness(sql: Sql, profileId: string) {
  const rows = await sql<
    Array<{
      photo_url: string | null; headline: string | null; summary: string | null; region_id: string | null;
      education_level: string | null; languages: string[]; desired_income_min: string | null;
      preferred_work_types: string[]; years_experience: number; jobs_completed: number; tasks_completed: number;
      completion_rate: string | null; on_time_rate: string | null; cancellation_rate: string | null;
      avg_rating: string | null; rating_count: number; response_rate: string | null;
      email_verified_at: Date | null; phone_verified_at: Date | null; has_cv: boolean;
      skill_count: number; verified_skill_count: number; ai_skill_count: number; in_demand: number;
      sims: number; best_sim: number | null; avg_sim: string | null; portfolio: number;
    }>
  >`
    SELECT wp.photo_url, wp.headline, wp.summary, wp.region_id, wp.education_level, wp.languages,
           wp.desired_income_min, wp.preferred_work_types, wp.years_experience,
           wp.jobs_completed, wp.tasks_completed, wp.completion_rate, wp.on_time_rate,
           wp.cancellation_rate, wp.avg_rating, wp.rating_count, wp.response_rate,
           u.email_verified_at, u.phone_verified_at,
           EXISTS (SELECT 1 FROM cv_documents c WHERE c.worker_profile_id = wp.id) AS has_cv,
           (SELECT count(*)::int FROM worker_skills ws WHERE ws.worker_profile_id = wp.id) AS skill_count,
           (SELECT count(*)::int FROM worker_skills ws WHERE ws.worker_profile_id = wp.id
              AND ws.evidence_level IN ('SIMULATION_VERIFIED','EMPLOYER_VERIFIED')) AS verified_skill_count,
           (SELECT count(*)::int FROM worker_skills ws WHERE ws.worker_profile_id = wp.id
              AND ws.evidence_level = 'AI_INFERRED') AS ai_skill_count,
           (SELECT count(*)::int FROM worker_skills ws JOIN skills s ON s.id = ws.skill_id
              WHERE ws.worker_profile_id = wp.id AND s.demand_score >= 70) AS in_demand,
           (SELECT count(*)::int FROM simulation_attempts sa
              WHERE sa.worker_profile_id = wp.id AND sa.state = 'EVALUATED') AS sims,
           (SELECT max(sa.score) FROM simulation_attempts sa
              WHERE sa.worker_profile_id = wp.id AND sa.state = 'EVALUATED') AS best_sim,
           (SELECT avg(sa.score)::text FROM simulation_attempts sa
              WHERE sa.worker_profile_id = wp.id AND sa.state = 'EVALUATED') AS avg_sim,
           (SELECT count(*)::int FROM portfolio_items p
              WHERE p.worker_profile_id = wp.id AND p.deleted_at IS NULL) AS portfolio
    FROM worker_profiles wp JOIN users u ON u.id = wp.user_id
    WHERE wp.id = ${profileId}
  `;

  const r = rows[0];
  if (!r) return;
  const num = (v: string | null) => (v === null ? null : Number(v));

  const snapshot: ReadinessSnapshot = {
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
    aiInferredSkillCount: r.ai_skill_count,
    inDemandSkillCount: r.in_demand,
    simulationsCompleted: r.sims,
    bestSimulationScore: r.best_sim,
    averageSimulationScore: r.avg_sim ? Math.round(Number(r.avg_sim)) : null,
    portfolioItemCount: r.portfolio,
    verifiedPortfolioItemCount: 0,
    interviewsCompleted: 0,
    bestInterviewScore: null,
    writtenCommunicationScore: null,
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
    disputesLost: 0,
  };

  const result = computeReadiness(snapshot);
  const completion = result.components.find((c) => c.key === 'profileCompleteness')?.score ?? 0;

  await sql`
    UPDATE worker_profiles
    SET readiness_score = ${result.score}, readiness_components = ${json(result)},
        readiness_computed_at = now(), profile_completion = ${Math.round(completion)}
    WHERE id = ${profileId}
  `;
}

/** Build match profiles and create applications with genuine scores. */
async function seedApplications(
  sql: Sql,
  workers: Map<string, { userId: string; profileId: string }>,
  jobIds: string[],
  taskIds: string[],
): Promise<number> {
  let created = 0;

  const profiles = await sql<
    Array<{
      id: string; region_id: string | null; years_experience: number; education_level: string | null;
      work_arrangement: string; preferred_work_types: string[]; desired_income_min: string | null;
      income_period: string; languages: string[]; has_laptop: boolean; internet_access: string;
      readiness_score: number;
      skills: Array<{ slug: string; level: string | null; evidence: string }> | null;
    }>
  >`
    SELECT wp.id, wp.region_id, wp.years_experience, wp.education_level, wp.work_arrangement::text,
           wp.preferred_work_types, wp.desired_income_min, wp.income_period, wp.languages,
           wp.has_laptop, wp.internet_access::text, wp.readiness_score,
           (SELECT json_agg(json_build_object('slug', s.slug,
              'level', coalesce(ws.assessed_level, ws.self_reported_level), 'evidence', ws.evidence_level))
              FROM worker_skills ws JOIN skills s ON s.id = ws.skill_id
             WHERE ws.worker_profile_id = wp.id) AS skills
    FROM worker_profiles wp
    WHERE wp.id = ANY(${[...workers.values()].map((w) => w.profileId)}::uuid[])
  `;

  const jobs = await sql<
    Array<{ id: string; region_id: string | null; work_arrangement: string; employment_type: string;
      salary_min: string | null; salary_max: string | null; min_years_experience: number;
      min_education: string | null; required_skills: string[] | null }>
  >`
    SELECT j.id, j.region_id, j.work_arrangement::text, j.employment_type::text,
           j.salary_min, j.salary_max, j.min_years_experience, j.min_education::text,
           (SELECT array_agg(s.slug) FROM job_skills js JOIN skills s ON s.id = js.skill_id
             WHERE js.job_id = j.id AND js.is_required) AS required_skills
    FROM jobs j WHERE j.id = ANY(${jobIds}::uuid[])
  `;

  const tasks = await sql<
    Array<{ id: string; budget_amount: string; requires_laptop: boolean; required_skills: string[] | null }>
  >`
    SELECT t.id, t.budget_amount, t.requires_laptop,
           (SELECT array_agg(s.slug) FROM task_skills ts JOIN skills s ON s.id = ts.skill_id
             WHERE ts.task_id = t.id) AS required_skills
    FROM tasks t WHERE t.id = ANY(${taskIds}::uuid[])
  `;

  for (const profile of profiles) {
    const matchProfile: WorkerMatchProfile = {
      skills: (profile.skills ?? []).map((s) => ({
        skillSlug: s.slug,
        level: (s.level as WorkerMatchProfile['skills'][number]['level']) ?? null,
        evidenceLevel: s.evidence as WorkerMatchProfile['skills'][number]['evidenceLevel'],
      })),
      yearsExperience: profile.years_experience,
      educationLevel: profile.education_level,
      regionId: profile.region_id,
      regionName: null,
      workArrangement: profile.work_arrangement as WorkerMatchProfile['workArrangement'],
      preferredWorkTypes: profile.preferred_work_types,
      desiredIncomeMin: profile.desired_income_min ? Number(profile.desired_income_min) : null,
      desiredIncomeMax: null,
      incomePeriod: profile.income_period,
      languages: profile.languages,
      hasLaptop: profile.has_laptop,
      internetAccess: profile.internet_access as WorkerMatchProfile['internetAccess'],
      isAvailable: true,
      hoursPerWeek: 40,
      completionRate: null,
      averageRating: null,
      ratingCount: 0,
      tasksCompleted: 0,
      readinessScore: profile.readiness_score,
    };

    // Apply to the three jobs and two tasks this worker actually matches best,
    // so the demo shows a realistic, non-random application pattern.
    const rankedJobs = jobs
      .map((job) => ({
        job,
        match: computeMatch(matchProfile, {
          kind: 'JOB',
          requiredSkills: (job.required_skills ?? []).map((slug) => ({ skillSlug: slug })),
          preferredSkills: [],
          minYearsExperience: job.min_years_experience,
          minEducation: job.min_education,
          regionId: job.region_id,
          regionName: null,
          workArrangement: job.work_arrangement as 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY',
          employmentType: job.employment_type,
          payMin: job.salary_min ? Number(job.salary_min) : null,
          payMax: job.salary_max ? Number(job.salary_max) : null,
          payPeriod: 'MONTHLY',
          languagesRequired: [],
          requiresLaptop: job.work_arrangement === 'REMOTE',
          requiresLocation: job.work_arrangement !== 'REMOTE',
        }),
      }))
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 3);

    for (const [index, { job, match }] of rankedJobs.entries()) {
      const status = index === 0 && match.score >= 70 ? 'SHORTLISTED' : index === 1 ? 'VIEWED' : 'SUBMITTED';
      const rows = await sql<{ id: string }[]>`
        INSERT INTO applications (
          job_id, worker_profile_id, cover_note, status, match_score, match_explanation,
          created_at, viewed_at
        ) VALUES (
          ${job.id}, ${profile.id},
          ${'I would like to be considered for this role. My profile shows verified evidence for the core requirements.'},
          ${status}::application_status, ${match.score},
          ${json({ reasons: match.reasons, gaps: match.gaps, band: match.band })},
          now() - (${seeded(job.id + profile.id, 20)}::text || ' days')::interval,
          ${status === 'SUBMITTED' ? null : sql`now() - interval '2 days'`}
        )
        ON CONFLICT (job_id, worker_profile_id) DO NOTHING
        RETURNING id
      `;
      if (rows[0]) created += 1;
    }

    const rankedTasks = tasks
      .map((task) => ({
        task,
        match: computeMatch(matchProfile, {
          kind: 'TASK',
          requiredSkills: (task.required_skills ?? []).map((slug) => ({ skillSlug: slug })),
          preferredSkills: [],
          minYearsExperience: 0,
          minEducation: null,
          regionId: null,
          regionName: null,
          workArrangement: 'REMOTE',
          employmentType: 'GIG',
          payMin: Number(task.budget_amount),
          payMax: Number(task.budget_amount),
          payPeriod: 'PER_TASK',
          languagesRequired: [],
          requiresLaptop: task.requires_laptop,
          requiresLocation: false,
        }),
      }))
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 2);

    for (const { task, match } of rankedTasks) {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO task_applications (
          task_id, worker_profile_id, proposal, bid_amount, estimated_days,
          status, match_score, match_explanation, created_at
        ) VALUES (
          ${task.id}, ${profile.id},
          ${'I can deliver this to your stated standard. My profile carries verified evidence for the skills required.'},
          ${Number(task.budget_amount)}, ${3 + seeded(task.id, 5)}, 'SUBMITTED',
          ${match.score}, ${json({ reasons: match.reasons, gaps: match.gaps })},
          now() - (${seeded(task.id + profile.id, 10)}::text || ' days')::interval
        )
        ON CONFLICT (task_id, worker_profile_id) DO NOTHING
        RETURNING id
      `;
      if (rows[0]) created += 1;
    }
  }

  await sql`
    UPDATE jobs j SET application_count = (SELECT count(*) FROM applications a WHERE a.job_id = j.id)
    WHERE j.is_demo
  `;
  await sql`
    UPDATE tasks t SET application_count = (SELECT count(*) FROM task_applications ta WHERE ta.task_id = t.id)
    WHERE t.is_demo
  `;

  return created;
}

/**
 * Complete a handful of tasks end to end, moving real money through the
 * ledger so the North Star metric is non-zero in the demo.
 */
async function seedCompletedWork(
  sql: Sql,
  workers: Map<string, { userId: string; profileId: string }>,
  taskIds: string[],
): Promise<number> {
  const candidates = await sql<
    Array<{ id: string; task_id: string; worker_profile_id: string; worker_user_id: string;
      employer_user_id: string; company_id: string; budget_amount: string; task_title: string }>
  >`
    SELECT ta.id, ta.task_id, ta.worker_profile_id, wp.user_id AS worker_user_id,
           t.posted_by AS employer_user_id, t.company_id, t.budget_amount, t.title AS task_title
    FROM task_applications ta
    JOIN tasks t ON t.id = ta.task_id
    JOIN worker_profiles wp ON wp.id = ta.worker_profile_id
    WHERE ta.task_id = ANY(${taskIds}::uuid[]) AND ta.status = 'SUBMITTED'
    ORDER BY ta.match_score DESC NULLS LAST
    LIMIT 8
  `;

  let completed = 0;
  const usedTasks = new Set<string>();

  for (const candidate of candidates) {
    if (usedTasks.has(candidate.task_id)) continue;
    usedTasks.add(candidate.task_id);

    const gross = Number(candidate.budget_amount);
    const fee = Math.round(gross * 0.1);
    const net = gross - fee;

    const assignments = await sql<{ id: string }[]>`
      INSERT INTO task_assignments (
        task_id, worker_profile_id, application_id, agreed_amount, currency, status,
        due_at, started_at, completed_at
      ) VALUES (
        ${candidate.task_id}, ${candidate.worker_profile_id}, ${candidate.id}, ${gross}, 'KES',
        'APPROVED', now() - interval '3 days', now() - interval '12 days', now() - interval '4 days'
      )
      RETURNING id
    `;
    const assignmentId = assignments[0]?.id;
    if (!assignmentId) continue;

    await sql`UPDATE task_applications SET status = 'ACCEPTED', decided_at = now() WHERE id = ${candidate.id}`;
    await sql`
      UPDATE tasks SET status = 'COMPLETED', workers_assigned = 1, completed_at = now() - interval '4 days'
      WHERE id = ${candidate.task_id}
    `;

    const submissions = await sql<{ id: string }[]>`
      INSERT INTO work_submissions (
        assignment_id, task_id, worker_profile_id, summary, status, quality_rating,
        reviewer_id, reviewed_at, submitted_at
      ) VALUES (
        ${assignmentId}, ${candidate.task_id}, ${candidate.worker_profile_id},
        ${'Delivered in the requested format. Flagged three ambiguous records rather than guessing.'},
        'APPROVED', 5, ${candidate.employer_user_id}, now() - interval '4 days', now() - interval '5 days'
      )
      RETURNING id
    `;

    // Move money through the ledger, matching what releasePayment() writes.
    await settleDemoPayment(sql, {
      assignmentId,
      taskId: candidate.task_id,
      employerUserId: candidate.employer_user_id,
      companyId: candidate.company_id,
      workerUserId: candidate.worker_user_id,
      gross,
      fee,
      net,
      reference: `KZ-P-DEMO${completed.toString().padStart(4, '0')}`,
    });

    // Reviews in both directions, anchored to real approved work.
    await sql`
      INSERT INTO reviews (
        subject_kind, subject_user_id, author_id, assignment_id, task_id,
        rating, quality_rating, communication_rating, timeliness_rating, comment, created_at
      ) VALUES (
        'WORKER', ${candidate.worker_user_id}, ${candidate.employer_user_id},
        ${assignmentId}, ${candidate.task_id}, 5, 5, 5, 4,
        ${'Delivered exactly what was asked for, on time, and flagged the unclear cases instead of guessing.'},
        now() - interval '3 days'
      )
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO reviews (
        subject_kind, subject_user_id, author_id, assignment_id, task_id,
        rating, comment, created_at
      ) VALUES (
        'EMPLOYER', ${candidate.employer_user_id}, ${candidate.worker_user_id},
        ${assignmentId}, ${candidate.task_id}, 5,
        ${'Clear brief, quick approval, and payment released immediately.'},
        now() - interval '3 days'
      )
      ON CONFLICT DO NOTHING
    `;

    // Approved work becomes a verified portfolio item.
    await sql`
      INSERT INTO portfolio_items (
        worker_profile_id, title, description, kind, evidence_level, source_submission_id, completed_on
      ) VALUES (
        ${candidate.worker_profile_id}, ${candidate.task_title},
        ${'Completed and approved through KaziOS.'}, 'TEXT', 'EMPLOYER_VERIFIED',
        ${submissions[0]?.id ?? null}, current_date - 4
      )
    `;

    completed += 1;
  }

  // Refresh the denormalised worker statistics from source data.
  await sql`
    UPDATE worker_profiles wp SET
      tasks_completed = stats.completed,
      total_earned = stats.earned,
      completion_rate = CASE WHEN stats.started > 0
        THEN round(stats.completed::numeric * 100 / stats.started, 2) END,
      on_time_rate = CASE WHEN stats.completed > 0 THEN 100 END,
      cancellation_rate = 0,
      avg_rating = reviews.avg_rating,
      rating_count = reviews.rating_count
    FROM (
      SELECT a.worker_profile_id,
             count(*) AS started,
             count(*) FILTER (WHERE a.status = 'APPROVED') AS completed,
             coalesce(sum(p.net_amount) FILTER (WHERE p.status = 'RELEASED'), 0) AS earned
      FROM task_assignments a
      LEFT JOIN payments p ON p.assignment_id = a.id
      GROUP BY a.worker_profile_id
    ) stats
    LEFT JOIN LATERAL (
      SELECT round(avg(r.rating), 2) AS avg_rating, count(*)::int AS rating_count
      FROM reviews r JOIN worker_profiles w ON w.user_id = r.subject_user_id
      WHERE w.id = stats.worker_profile_id AND r.is_published AND NOT r.is_flagged
    ) reviews ON true
    WHERE wp.id = stats.worker_profile_id
  `;

  await sql`
    UPDATE companies c SET total_spent = coalesce((
      SELECT sum(p.gross_amount) FROM payments p
      WHERE p.payer_company_id = c.id AND p.status = 'RELEASED'
    ), 0)
    WHERE c.is_demo
  `;

  return completed;
}

/** Write the payment and the four ledger entries a real release produces. */
async function settleDemoPayment(
  sql: Sql,
  input: {
    assignmentId: string; taskId: string; employerUserId: string; companyId: string;
    workerUserId: string; gross: number; fee: number; net: number; reference: string;
  },
) {
  const payments = await sql<{ id: string }[]>`
    INSERT INTO payments (
      reference, payer_user_id, payer_company_id, payee_user_id, task_id, assignment_id,
      gross_amount, platform_fee, net_amount, currency, status, provider, idempotency_key,
      initiated_at, held_at, released_at
    ) VALUES (
      ${input.reference}, ${input.employerUserId}, ${input.companyId}, ${input.workerUserId},
      ${input.taskId}, ${input.assignmentId},
      ${input.gross}, ${input.fee}, ${input.net}, 'KES', 'RELEASED', 'mock',
      ${`seed:${input.assignmentId}`},
      now() - interval '12 days', now() - interval '12 days', now() - interval '4 days'
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `;
  const paymentId = payments[0]?.id;
  if (!paymentId) return;

  // Employer: available -> spent.
  const employerWallets = await sql<{ id: string; balance_available: string }[]>`
    UPDATE wallets SET balance_available = balance_available - ${input.gross},
                       lifetime_spent = lifetime_spent + ${input.gross}
    WHERE owner_id = ${input.employerUserId} AND currency = 'KES'
    RETURNING id, balance_available
  `;
  if (employerWallets[0]) {
    await sql`
      INSERT INTO transactions (wallet_id, payment_id, kind, direction, amount, currency, balance_after, description, metadata)
      VALUES (${employerWallets[0].id}, ${paymentId}, 'ESCROW_RELEASE', 'DEBIT', ${input.gross}, 'KES',
              ${Number(employerWallets[0].balance_available)},
              ${`Payment released for approved work (${input.reference})`},
              ${json({ bucket: 'available', demo: true })})
    `;
  }

  // Worker: credited net.
  const workerWallets = await sql<{ id: string; balance_available: string }[]>`
    INSERT INTO wallets (owner_id, kind, currency, balance_available, lifetime_earned)
    VALUES (${input.workerUserId}, 'WORKER', 'KES', ${input.net}, ${input.net})
    ON CONFLICT (owner_id, currency) WHERE owner_id IS NOT NULL DO UPDATE SET
      balance_available = wallets.balance_available + ${input.net},
      lifetime_earned = wallets.lifetime_earned + ${input.net}
    RETURNING id, balance_available
  `;
  if (workerWallets[0]) {
    await sql`
      INSERT INTO transactions (wallet_id, payment_id, kind, direction, amount, currency, balance_after, description, metadata)
      VALUES (${workerWallets[0].id}, ${paymentId}, 'ESCROW_RELEASE', 'CREDIT', ${input.net}, 'KES',
              ${Number(workerWallets[0].balance_available)},
              ${`Payment received for approved work (${input.reference})`},
              ${json({ bucket: 'available', demo: true })})
    `;
  }

  // Platform: fee revenue.
  const platformWallets = await sql<{ id: string; balance_available: string }[]>`
    INSERT INTO wallets (owner_id, kind, currency, balance_available)
    VALUES (NULL, 'PLATFORM', 'KES', ${input.fee})
    ON CONFLICT (kind, currency) WHERE owner_id IS NULL
      DO UPDATE SET balance_available = wallets.balance_available + ${input.fee}
    RETURNING id, balance_available
  `;
  if (platformWallets[0]) {
    await sql`
      INSERT INTO transactions (wallet_id, payment_id, kind, direction, amount, currency, balance_after, description, metadata)
      VALUES (${platformWallets[0].id}, ${paymentId}, 'PLATFORM_FEE', 'CREDIT', ${input.fee}, 'KES',
              ${Number(platformWallets[0].balance_available)},
              ${`Platform fee on ${input.reference}`},
              ${json({ bucket: 'available', demo: true })})
    `;
  }
}

/**
 * Remove everything the seed created, in dependency order.
 *
 * The ledger is protected by an append-only trigger, which is exactly what we
 * want in production. Clearing demo data is the one legitimate exception, so
 * the trigger is disabled explicitly and re-enabled immediately — never left
 * off, and never bypassed silently.
 */
async function clearDemoData(sql: Sql) {
  await sql`ALTER TABLE transactions DISABLE TRIGGER trg_transactions_append_only`;
  try {
    await sql`DELETE FROM transactions WHERE metadata->>'demo' = 'true'`;
    await sql`
      DELETE FROM transactions t
      USING wallets w, users u
      WHERE t.wallet_id = w.id AND w.owner_id = u.id AND u.is_demo
    `;
    await sql`
      DELETE FROM transactions t USING wallets w
      WHERE t.wallet_id = w.id AND w.owner_id IS NULL
    `;
  } finally {
    await sql`ALTER TABLE transactions ENABLE TRIGGER trg_transactions_append_only`;
  }
  await sql`DELETE FROM payments WHERE idempotency_key LIKE 'seed:%'`;
  await sql`DELETE FROM tasks WHERE is_demo`;
  await sql`DELETE FROM jobs WHERE is_demo`;
  await sql`DELETE FROM companies WHERE is_demo`;
  // Users cascade to profiles, skills, applications, attempts and wallets.
  await sql`DELETE FROM users WHERE is_demo`;
  await sql`DELETE FROM simulations WHERE generator_version = 'seed:demo'`;
  await sql`DELETE FROM wallets WHERE owner_id IS NULL`;
}

main().catch((err: unknown) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
