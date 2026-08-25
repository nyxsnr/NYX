/**
 * Analytics.
 *
 * Events are written to `analytics_events` first — that table is the source of
 * truth and works with no third-party configured. PostHog, when a key is set,
 * is a mirror for product exploration, never the system of record.
 *
 * The North Star metric (income generated for workers) is deliberately NOT
 * computed from events: it comes from released payments in the ledger, so it
 * can never drift from money that actually moved.
 */
import 'server-only';
import { json, sql, type Db } from '@/lib/db/client';
import { publicEnv } from '@/lib/config/env';
import type { UserRole } from '@/lib/auth/rbac';

/**
 * The complete event vocabulary. A closed union rather than free-form strings,
 * so a typo in an event name is a compile error instead of a silent gap in the
 * funnel three months later.
 */
export type AnalyticsEvent =
  | 'signup'
  | 'onboarding_started'
  | 'onboarding_complete'
  | 'cv_uploaded'
  | 'cv_parsed'
  | 'assessment_started'
  | 'assessment_completed'
  | 'simulation_started'
  | 'simulation_completed'
  | 'interview_started'
  | 'interview_completed'
  | 'portfolio_item_added'
  | 'job_viewed'
  | 'job_applied'
  | 'task_viewed'
  | 'task_applied'
  | 'employer_signup'
  | 'employer_onboarding_complete'
  | 'job_posted'
  | 'task_posted'
  | 'project_decomposed'
  | 'candidate_shortlisted'
  | 'candidate_hired'
  | 'task_assigned'
  | 'task_started'
  | 'task_submitted'
  | 'task_approved'
  | 'revision_requested'
  | 'payment_initiated'
  | 'payment_completed'
  | 'payout_requested'
  | 'review_submitted'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'career_agent_message'
  | 'verification_submitted'
  | 'verification_approved';

export interface TrackInput {
  event: AnalyticsEvent;
  userId?: string | null;
  anonymousId?: string | null;
  role?: UserRole | null;
  entityType?: string | null;
  entityId?: string | null;
  properties?: Record<string, unknown>;
  sessionId?: string | null;
}

/** Property keys that must never be recorded. */
const FORBIDDEN_PROPERTIES = new Set([
  'password', 'token', 'email', 'phone', 'fullName', 'nationalId', 'kraPin', 'cvText',
]);

function scrub(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_PROPERTIES.has(key)) continue;
    // Bound the payload: analytics is not a document store.
    if (typeof value === 'string' && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Record an event. Never throws: a failed analytics write must not break a
 * worker's application or an employer's payment.
 */
export async function track(input: TrackInput, db: Db = sql): Promise<void> {
  try {
    await db`
      INSERT INTO analytics_events (event, user_id, anonymous_id, role, entity_type, entity_id, properties, session_id)
      VALUES (
        ${input.event}, ${input.userId ?? null}, ${input.anonymousId ?? null}, ${input.role ?? null},
        ${input.entityType ?? null}, ${input.entityId ?? null},
        ${json(scrub(input.properties ?? {}))}, ${input.sessionId ?? null}
      )
    `;
  } catch (err) {
    console.error('[analytics] write failed', input.event, err);
  }

  if (publicEnv.posthogKey) {
    void mirrorToPostHog(input);
  }
}

/** Fire-and-forget mirror. Failures are logged, never surfaced. */
async function mirrorToPostHog(input: TrackInput): Promise<void> {
  try {
    await fetch(`${publicEnv.posthogHost}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: publicEnv.posthogKey,
        event: input.event,
        distinct_id: input.userId ?? input.anonymousId ?? 'anonymous',
        properties: { ...scrub(input.properties ?? {}), role: input.role, $lib: 'kazios-server' },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('[analytics] posthog mirror failed', err);
  }
}

// ---------------------------------------------------------------------------
// Metric queries
// ---------------------------------------------------------------------------

export interface PlatformMetrics {
  registeredWorkers: number;
  registeredEmployers: number;
  activeWorkers30d: number;
  activeEmployers30d: number;
  openJobs: number;
  openTasks: number;
  totalApplications: number;
  totalPlacements: number;
  completedAssignments: number;
  /** The North Star, in KES minor units. From the ledger, not from events. */
  workerIncomeTotal: number;
  platformRevenueTotal: number;
  escrowHeldTotal: number;
  openDisputes: number;
  openFraudFlags: number;
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const rows = await sql<
    Array<Record<string, string | number>>
  >`SELECT * FROM v_platform_metrics`;
  const row = rows[0] ?? {};
  const n = (key: string) => Number(row[key] ?? 0);

  return {
    registeredWorkers: n('registered_workers'),
    registeredEmployers: n('registered_employers'),
    activeWorkers30d: n('active_workers_30d'),
    activeEmployers30d: n('active_employers_30d'),
    openJobs: n('open_jobs'),
    openTasks: n('open_tasks'),
    totalApplications: n('total_applications'),
    totalPlacements: n('total_placements'),
    completedAssignments: n('completed_assignments'),
    workerIncomeTotal: n('worker_income_total'),
    platformRevenueTotal: n('platform_revenue_total'),
    escrowHeldTotal: n('escrow_held_total'),
    openDisputes: n('open_disputes'),
    openFraudFlags: n('open_fraud_flags'),
  };
}

export interface ActivationMetrics {
  workersTotal: number;
  workersOnboarded: number;
  workersWithSimulation: number;
  workersWhoApplied: number;
  workersWhoEarned: number;
  workersEarnedWithin30d: number;
  medianDaysToFirstIncome: number | null;
  averageWorkerEarnings: number;
}

/** The activation funnel. This is the report the product is judged by. */
export async function getActivationMetrics(): Promise<ActivationMetrics> {
  const rows = await sql<
    Array<{
      workers_total: string; workers_onboarded: string; workers_with_simulation: string;
      workers_who_applied: string; workers_who_earned: string; workers_earned_within_30d: string;
      median_days: string | null; average_earnings: string | null;
    }>
  >`
    SELECT
      count(*)::text                                                        AS workers_total,
      count(*) FILTER (WHERE onboarding_completed_at IS NOT NULL)::text      AS workers_onboarded,
      count(*) FILTER (WHERE simulations_completed > 0)::text                AS workers_with_simulation,
      count(*) FILTER (WHERE job_applications + task_applications > 0)::text AS workers_who_applied,
      count(*) FILTER (WHERE total_income > 0)::text                         AS workers_who_earned,
      count(*) FILTER (WHERE earned_within_30d)::text                        AS workers_earned_within_30d,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY days_to_first_income)::text AS median_days,
      avg(total_income) FILTER (WHERE total_income > 0)::text                AS average_earnings
    FROM v_worker_activation
  `;

  const row = rows[0];
  return {
    workersTotal: Number(row?.workers_total ?? 0),
    workersOnboarded: Number(row?.workers_onboarded ?? 0),
    workersWithSimulation: Number(row?.workers_with_simulation ?? 0),
    workersWhoApplied: Number(row?.workers_who_applied ?? 0),
    workersWhoEarned: Number(row?.workers_who_earned ?? 0),
    workersEarnedWithin30d: Number(row?.workers_earned_within_30d ?? 0),
    medianDaysToFirstIncome: row?.median_days ? Math.round(Number(row.median_days) * 10) / 10 : null,
    averageWorkerEarnings: Math.round(Number(row?.average_earnings ?? 0)),
  };
}

export interface FunnelPoint {
  event: string;
  occurrences: number;
  uniqueUsers: number;
}

export async function getFunnel(days = 30): Promise<FunnelPoint[]> {
  const rows = await sql<Array<{ event: string; occurrences: string; unique_users: string }>>`
    SELECT event, count(*)::text AS occurrences, count(DISTINCT user_id)::text AS unique_users
    FROM analytics_events
    WHERE created_at > now() - (${days}::text || ' days')::interval
    GROUP BY event
    ORDER BY count(*) DESC
  `;
  return rows.map((r) => ({
    event: r.event,
    occurrences: Number(r.occurrences),
    uniqueUsers: Number(r.unique_users),
  }));
}

/** Employer retention input: how many companies posted in more than one month. */
export async function getEmployerRepeatRate(): Promise<{ total: number; repeat: number; rate: number }> {
  const rows = await sql<Array<{ total: string; repeat: string }>>`
    WITH months AS (
      SELECT company_id, count(DISTINCT date_trunc('month', created_at)) AS active_months
      FROM (
        SELECT company_id, created_at FROM jobs  WHERE deleted_at IS NULL
        UNION ALL
        SELECT company_id, created_at FROM tasks WHERE deleted_at IS NULL
      ) postings
      GROUP BY company_id
    )
    SELECT count(*)::text AS total, count(*) FILTER (WHERE active_months > 1)::text AS repeat FROM months
  `;
  const total = Number(rows[0]?.total ?? 0);
  const repeat = Number(rows[0]?.repeat ?? 0);
  return { total, repeat, rate: total > 0 ? Math.round((repeat / total) * 1000) / 10 : 0 };
}
