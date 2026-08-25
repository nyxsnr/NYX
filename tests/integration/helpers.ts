/**
 * Integration test harness.
 *
 * These suites run against a real PostgreSQL database, because the behaviour
 * they verify — transactional escrow, CHECK constraints, the append-only
 * ledger trigger, cascade rules — lives in the database and cannot be
 * meaningfully tested against a mock.
 *
 * They skip themselves when TEST_DATABASE_URL is unset, so `npm test` still
 * passes on a machine with no Postgres.
 */
import { afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { hashPassword } from '@/lib/auth/password';

export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

/** Tables cleared between tests, in dependency order. */
const TRUNCATE_TABLES = [
  'analytics_events', 'audit_log', 'ai_usage', 'ai_recommendations', 'ai_assessments',
  'agent_conversations', 'notifications', 'messages', 'conversation_participants',
  'conversations', 'reports', 'fraud_flags', 'disputes', 'reviews', 'payouts',
  'transactions', 'payments', 'wallets', 'submission_files', 'work_submissions',
  'task_assignments', 'task_applications', 'task_files', 'task_skills', 'tasks',
  'projects', 'applications', 'job_skills', 'jobs', 'portfolio_item_skills',
  'portfolio_items', 'interview_sessions', 'simulation_attempts', 'simulations',
  'cv_documents', 'files', 'worker_skills', 'worker_profiles', 'employer_profiles',
  'companies', 'verification_records', 'sessions', 'rate_limits', 'embeddings', 'users',
];

let client: postgres.Sql<Record<string, never>> | null = null;

export function testDb() {
  if (!client) {
    client = postgres(process.env.TEST_DATABASE_URL as string, { max: 2, ssl: false });
  }
  return client;
}

/**
 * Reset the database before each test.
 *
 * The ledger's append-only trigger is disabled for the truncate and re-enabled
 * immediately — the same explicit, scoped override the seed script uses. If a
 * test could bypass the guard implicitly, the guard would be worthless.
 */
export function useCleanDatabase() {
  beforeEach(async () => {
    const sql = testDb();
    await sql.unsafe(`
      ALTER TABLE transactions DISABLE TRIGGER trg_transactions_append_only;
      TRUNCATE ${TRUNCATE_TABLES.join(', ')} RESTART IDENTITY CASCADE;
      ALTER TABLE transactions ENABLE TRIGGER trg_transactions_append_only;
    `);
  });

  afterAll(async () => {
    if (client) {
      await client.end({ timeout: 5 });
      client = null;
    }
  });
}

let passwordHashCache: string | null = null;

/** scrypt is deliberately slow; hash the shared test password once. */
async function testPasswordHash(): Promise<string> {
  passwordHashCache ??= await hashPassword('integration-test-password-123');
  return passwordHashCache;
}

export const TEST_PASSWORD = 'integration-test-password-123';

export async function createUser(input: {
  email: string;
  role: 'WORKER' | 'EMPLOYER' | 'ADMIN';
  fullName?: string;
  phone?: string;
  verified?: boolean;
}): Promise<string> {
  const sql = testDb();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO users (
      email, email_normalized, password_hash, role, status, full_name, phone, phone_normalized,
      email_verified_at, phone_verified_at
    ) VALUES (
      ${input.email}, ${input.email.toLowerCase()}, ${await testPasswordHash()},
      ${input.role}::user_role, 'ACTIVE', ${input.fullName ?? 'Test User'},
      ${input.phone ?? null}, ${input.phone ?? null},
      ${input.verified === false ? null : sql`now()`},
      ${input.verified === false ? null : sql`now()`}
    )
    RETURNING id
  `;
  return rows[0]?.id as string;
}

export async function createWorker(email: string, options: { skills?: string[] } = {}) {
  const sql = testDb();
  const userId = await createUser({ email, role: 'WORKER', fullName: 'Test Worker' });
  const rows = await sql<{ id: string }[]>`
    INSERT INTO worker_profiles (user_id, headline, summary, years_experience, onboarding_completed_at)
    VALUES (${userId}, 'Test worker', 'A worker created for integration tests.', 3, now())
    RETURNING id
  `;
  const profileId = rows[0]?.id as string;

  for (const slug of options.skills ?? []) {
    await sql`
      INSERT INTO worker_skills (worker_profile_id, skill_id, self_reported_level, evidence_level, source)
      SELECT ${profileId}, id, 'INTERMEDIATE', 'SELF_REPORTED', 'TEST' FROM skills WHERE slug = ${slug}
      ON CONFLICT DO NOTHING
    `;
  }

  return { userId, profileId };
}

export async function createEmployer(email: string, companyName = 'Test Company') {
  const sql = testDb();
  const userId = await createUser({ email, role: 'EMPLOYER', fullName: 'Test Employer' });
  const companies = await sql<{ id: string }[]>`
    INSERT INTO companies (name, slug, verification_tier)
    VALUES (${companyName}, ${`${companyName.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`}, 'BUSINESS_VERIFIED')
    RETURNING id
  `;
  const companyId = companies[0]?.id as string;
  await sql`INSERT INTO employer_profiles (user_id, company_id) VALUES (${userId}, ${companyId})`;
  return { userId, companyId };
}

export async function createTask(input: {
  companyId: string;
  postedBy: string;
  budgetMinor: number;
  workersNeeded?: number;
  skills?: string[];
}) {
  const sql = testDb();
  const rows = await sql<{ id: string }[]>`
    INSERT INTO tasks (
      company_id, posted_by, title, description, category, expected_output,
      budget_amount, workers_needed, status, published_at
    ) VALUES (
      ${input.companyId}, ${input.postedBy}, 'Integration test task',
      'A task created for integration tests.', 'Data', 'A completed deliverable.',
      ${input.budgetMinor}, ${input.workersNeeded ?? 1}, 'PUBLISHED', now()
    )
    RETURNING id
  `;
  const taskId = rows[0]?.id as string;

  for (const slug of input.skills ?? []) {
    await sql`
      INSERT INTO task_skills (task_id, skill_id, is_required)
      SELECT ${taskId}, id, true FROM skills WHERE slug = ${slug}
      ON CONFLICT DO NOTHING
    `;
  }
  return taskId;
}

/** Fund an employer wallet directly, so payment tests start with a balance. */
export async function fundEmployer(userId: string, amountMinor: number) {
  const sql = testDb();
  const wallets = await sql<{ id: string }[]>`
    INSERT INTO wallets (owner_id, kind, currency, balance_available)
    VALUES (${userId}, 'EMPLOYER', 'KES', ${amountMinor})
    ON CONFLICT (owner_id, currency) WHERE owner_id IS NOT NULL
      DO UPDATE SET balance_available = wallets.balance_available + ${amountMinor}
    RETURNING id
  `;
  const walletId = wallets[0]?.id as string;
  await sql`
    INSERT INTO transactions (wallet_id, kind, direction, amount, currency, balance_after, description, metadata)
    VALUES (${walletId}, 'DEPOSIT', 'CREDIT', ${amountMinor}, 'KES', ${amountMinor},
            'Test funding', ${sql.json({ bucket: 'available' })})
  `;
  return walletId;
}

export async function walletFor(userId: string, kind: 'WORKER' | 'EMPLOYER') {
  const sql = testDb();
  const rows = await sql<
    { balance_available: string; balance_pending: string; balance_escrow: string; lifetime_earned: string }[]
  >`
    SELECT balance_available, balance_pending, balance_escrow, lifetime_earned
    FROM wallets WHERE owner_id = ${userId} AND kind = ${kind}
  `;
  const row = rows[0];
  return {
    available: Number(row?.balance_available ?? 0),
    pending: Number(row?.balance_pending ?? 0),
    escrow: Number(row?.balance_escrow ?? 0),
    lifetimeEarned: Number(row?.lifetime_earned ?? 0),
  };
}
