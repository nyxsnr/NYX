# Database

PostgreSQL 14+. Migrations are plain SQL in `db/migrations`, applied in
filename order by `scripts/migrate.ts`.

## Migration policy

Applied migrations are **immutable**. The runner stores a SHA-256 checksum of
each file and refuses to continue if a previously-applied migration has
changed — silently diverging schemas between environments is the failure mode
this exists to prevent. To change something, add a new migration.

Each file runs inside its own transaction, so a half-applied migration is
impossible.

```bash
npm run db:migrate                 # apply pending
npm run db:migrate -- --status     # list applied / pending
npm run db:reset                   # drop and rebuild (never in production)
```

| Migration | Contents |
| --- | --- |
| `0001_foundation` | Extensions, enums, `countries` + `regions` (47 Kenyan counties) |
| `0002_identity` | `users`, `sessions`, `verification_records`, `audit_log`, `rate_limits` |
| `0003_profiles` | `skills`, `worker_skills`, `worker_profiles`, `companies`, `employer_profiles`, `files`, `cv_documents` |
| `0004_marketplace` | `jobs`, `tasks`, applications, `projects`, `task_assignments`, `work_submissions` |
| `0005_proof` | `simulation_templates`, `simulations`, `simulation_attempts`, `portfolio_items`, `interview_sessions` |
| `0006_money` | `wallets`, `payments`, `transactions`, `payouts` |
| `0007_trust` | `reviews`, `disputes`, `fraud_flags`, `reports` |
| `0008_comms_ai_analytics` | Messaging, notifications, `ai_assessments`, `analytics_events`, `embeddings` |
| `0009_vector_optional` | pgvector upgrade where available, with an exact cosine fallback |
| `0010_reference_data` | 76 skills, 20 simulation templates with rubrics |
| `0011_metrics_views` | Reporting views for the admin dashboard |
| `0012_review_anchor_integrity` | Fixes a cascade that could violate `chk_review_anchored` |

## Invariants enforced by the database

Business rules that must never be violated live in the schema, not in
application code that might be bypassed by a script, a migration or a bug.

| Invariant | Mechanism |
| --- | --- |
| The ledger cannot be rewritten | `BEFORE UPDATE OR DELETE` trigger on `transactions` raises |
| A wallet cannot go negative | `CHECK (balance_available >= 0)` on every bucket |
| A ledger entry is always positive | `CHECK (amount > 0)`; sign lives in `direction` |
| Fee and net always sum to gross | `CHECK (net_amount + platform_fee = gross_amount)` |
| A webhook replay cannot double-credit | `UNIQUE (provider, provider_reference)` |
| A retry cannot double-charge | `UNIQUE (idempotency_key)` on `payments` and `payouts` |
| A review is always anchored to real work | `chk_review_anchored`, with cascading FKs (0012) |
| Nobody can review themselves | `chk_review_not_self` |
| One application per worker per posting | `UNIQUE (job_id, worker_profile_id)` |
| One live simulation attempt per template | Partial unique index `WHERE state = 'STARTED'` |
| A closed account does not burn an email | Partial unique index `WHERE deleted_at IS NULL` |
| `updated_at` is always honest | `set_updated_at()` trigger, not application code |

### Note on partial indexes

Several uniqueness indexes are partial (for example
`idx_wallets_owner_currency ... WHERE owner_id IS NOT NULL`). `ON CONFLICT`
must repeat the predicate for PostgreSQL to infer the arbiter index:

```sql
ON CONFLICT (owner_id, currency) WHERE owner_id IS NOT NULL DO UPDATE …
```

Omitting it fails at runtime with *"no unique or exclusion constraint matching
the ON CONFLICT specification"*.

### Note on jsonb parameters

postgres.js serialises `json`/`jsonb` parameters itself. Writing
`${JSON.stringify(value)}::jsonb` therefore stores a JSON **string**
(`"{\"a\":1}"`) rather than an object, which breaks every `->>` lookup and
every jsonb index. Use the `json()` helper from `@/lib/db/client`; ESLint
enforces this.

## The capability ledger

`worker_skills` is the heart of the product. It keeps three things separate
that most systems collapse into one:

| Column | Meaning |
| --- | --- |
| `self_reported_level` | What the worker said |
| `assessed_level` | What was determined by AI or a scored simulation |
| `evidence_level` | On what basis: `SELF_REPORTED` → `AI_INFERRED` → `SIMULATION_VERIFIED` → `EMPLOYER_VERIFIED` |
| `evidence` | jsonb array of pointers: attempt ids, assessment ids, source quotes |
| `confidence` | 0–1, meaningful only for AI-inferred rows |

`upsertWorkerSkill` only ever moves `evidence_level` **up**, and appends to
`evidence` rather than replacing it, so the trail stays auditable.

## Money representation

Integer minor units (KES cents) in `bigint`, with an explicit `char(3)`
currency alongside. No floating point touches money anywhere in the codebase —
`0.1 + 0.2` problems in a payroll system are unacceptable.

## Soft deletion

`users`, `worker_profiles`, `companies`, `jobs`, `tasks`, `portfolio_items`,
`reviews` and `messages` carry `deleted_at`. Deleting a job must not erase the
application history of everyone who applied to it. Queries filter
`deleted_at IS NULL`; partial indexes are scoped to match.

## Reporting views

| View | Purpose |
| --- | --- |
| `v_worker_income` | Every shilling actually released, per worker |
| `v_platform_metrics` | One-row platform summary |
| `v_worker_activation` | Signup → onboarding → proof → application → income, with days to first income |
| `v_employer_activity` | Postings and spend per company |
| `v_daily_funnel` | Daily event counts |

The North Star — income generated for workers — comes from released payments in
the ledger, never from analytics events, so it cannot drift from money that
actually moved.

## Indexing

Partial indexes are used throughout so that the common query shape is the one
the index serves — for example `idx_jobs_published` covers only
`status = 'PUBLISHED' AND deleted_at IS NULL`, which is every public listing
query. Full-text search uses GIN indexes over
`to_tsvector('english', title || ' ' || description)`.
