-- ===========================================================================
-- 0011_metrics_views
-- Reporting views for the admin dashboard.
--
-- The North Star — income generated for workers — is derived from released
-- escrow in the ledger, never from analytics events. Money that moved is the
-- only acceptable source for that number.
-- ===========================================================================

-- Every shilling actually released to a worker.
CREATE OR REPLACE VIEW v_worker_income AS
SELECT
  p.payee_user_id                         AS user_id,
  p.currency,
  count(*)                                AS payments_received,
  sum(p.net_amount)                       AS total_income,
  min(p.released_at)                      AS first_income_at,
  max(p.released_at)                      AS latest_income_at
FROM payments p
WHERE p.status = 'RELEASED' AND p.payee_user_id IS NOT NULL
GROUP BY p.payee_user_id, p.currency;

-- Platform-level totals. Reads as one row.
CREATE OR REPLACE VIEW v_platform_metrics AS
SELECT
  (SELECT count(*) FROM users WHERE role = 'WORKER'   AND deleted_at IS NULL) AS registered_workers,
  (SELECT count(*) FROM users WHERE role = 'EMPLOYER' AND deleted_at IS NULL) AS registered_employers,
  (SELECT count(*) FROM users
     WHERE role = 'WORKER' AND deleted_at IS NULL AND last_login_at > now() - interval '30 days')
                                                                              AS active_workers_30d,
  (SELECT count(DISTINCT company_id) FROM jobs
     WHERE deleted_at IS NULL AND created_at > now() - interval '30 days')     AS active_employers_30d,
  (SELECT count(*) FROM jobs  WHERE deleted_at IS NULL AND status = 'PUBLISHED') AS open_jobs,
  (SELECT count(*) FROM tasks WHERE deleted_at IS NULL AND status = 'PUBLISHED') AS open_tasks,
  (SELECT count(*) FROM applications)                                          AS total_applications,
  (SELECT count(*) FROM applications WHERE status = 'HIRED')                   AS total_placements,
  (SELECT count(*) FROM task_assignments WHERE status = 'APPROVED')            AS completed_assignments,
  (SELECT coalesce(sum(net_amount), 0) FROM payments WHERE status = 'RELEASED') AS worker_income_total,
  (SELECT coalesce(sum(platform_fee), 0) FROM payments WHERE status = 'RELEASED') AS platform_revenue_total,
  (SELECT coalesce(sum(gross_amount), 0) FROM payments WHERE status = 'HELD_IN_ESCROW') AS escrow_held_total,
  (SELECT count(*) FROM disputes WHERE status IN ('OPEN','UNDER_REVIEW'))      AS open_disputes,
  (SELECT count(*) FROM fraud_flags WHERE state = 'OPEN')                      AS open_fraud_flags;

-- Worker activation: signed up -> earned money, and how long it took.
-- "Time to first income" is the metric the whole product is judged on.
CREATE OR REPLACE VIEW v_worker_activation AS
SELECT
  u.id                                              AS user_id,
  u.created_at                                      AS signed_up_at,
  wp.onboarding_completed_at,
  (SELECT count(*) FROM simulation_attempts sa
     WHERE sa.worker_profile_id = wp.id AND sa.state = 'EVALUATED') AS simulations_completed,
  (SELECT count(*) FROM applications a  WHERE a.worker_profile_id = wp.id) AS job_applications,
  (SELECT count(*) FROM task_applications ta WHERE ta.worker_profile_id = wp.id) AS task_applications,
  inc.first_income_at,
  coalesce(inc.total_income, 0)                     AS total_income,
  CASE
    WHEN inc.first_income_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (inc.first_income_at - u.created_at)) / 86400.0
  END                                               AS days_to_first_income,
  (inc.first_income_at IS NOT NULL
     AND inc.first_income_at <= u.created_at + interval '30 days') AS earned_within_30d
FROM users u
JOIN worker_profiles wp ON wp.user_id = u.id
LEFT JOIN v_worker_income inc ON inc.user_id = u.id
WHERE u.role = 'WORKER' AND u.deleted_at IS NULL;

-- Employer repeat rate input: postings and spend per company.
CREATE OR REPLACE VIEW v_employer_activity AS
SELECT
  c.id                                    AS company_id,
  c.name,
  c.verification_tier,
  (SELECT count(*) FROM jobs j  WHERE j.company_id = c.id AND j.deleted_at IS NULL)  AS jobs_posted,
  (SELECT count(*) FROM tasks t WHERE t.company_id = c.id AND t.deleted_at IS NULL)  AS tasks_posted,
  (SELECT count(*) FROM payments p WHERE p.payer_company_id = c.id AND p.status = 'RELEASED') AS payments_made,
  (SELECT coalesce(sum(p.gross_amount), 0) FROM payments p
     WHERE p.payer_company_id = c.id AND p.status = 'RELEASED')                       AS total_spent,
  (SELECT max(greatest(j.created_at, t.created_at))
     FROM jobs j FULL OUTER JOIN tasks t ON false
     WHERE j.company_id = c.id OR t.company_id = c.id)                                AS last_posting_at
FROM companies c
WHERE c.deleted_at IS NULL;

-- Daily funnel counts, for the admin analytics screen.
CREATE OR REPLACE VIEW v_daily_funnel AS
SELECT
  date_trunc('day', created_at)::date AS day,
  event,
  count(*)                            AS occurrences,
  count(DISTINCT user_id)             AS unique_users
FROM analytics_events
GROUP BY 1, 2;
