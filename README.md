# KaziOS

**AI-powered employment infrastructure for Kenya.**

KaziOS is not a job board. A job board starts with a vacancy and looks for a
candidate. KaziOS starts with a person and works forward to income:

```
PERSON → CAPABILITY → PROOF → WORK → PAYMENT → REPUTATION → BETTER WORK
```

The question the whole system is built to answer is **"what can this person
reliably do?"** — not "what does this person claim?".

---

## Why this is different

| Conventional job board | KaziOS |
| --- | --- |
| Matches on CV keywords | Matches on **evidence**, weighted by how it was established |
| Opaque ranking | Every score shows its reasons and its gaps |
| A skill is a word on a profile | A skill is self-reported, AI-inferred, simulation-verified or employer-verified — and never blurred |
| Rejection with no explanation | Applicants see exactly which requirement they could not evidence |
| Payment is the employer's problem | Task payments are escrowed before work starts |

### The evidence ladder

This is the core primitive. `worker_skills` stores what was claimed, what was
assessed, and on what basis, in three separate columns — collapsing them would
destroy the product's only real promise.

| Tier | Meaning | Matching weight |
| --- | --- | --- |
| `SELF_REPORTED` | The worker typed it | 0.35 |
| `AI_INFERRED` | Extracted from their CV or answers, with the source line shown to them | 0.55 |
| `SIMULATION_VERIFIED` | Demonstrated in a scored work simulation | 0.90 |
| `EMPLOYER_VERIFIED` | Confirmed by an employer after real, paid, approved work | 1.00 |

Evidence only ever moves **up**. A later self-report cannot overwrite a proven
skill, and a worker cannot delete a verified result — otherwise every good
result would be meaningless.

---

## Quick start

```bash
# 1. Dependencies (Node 22+, PostgreSQL 14+)
npm install
cp .env.example .env.local        # then set DATABASE_URL and SESSION_SECRET

# 2. Database
npm run db:migrate                # schema + skill taxonomy + simulation templates
npm run db:seed                   # realistic Kenyan demo data

# 3. Run
npm run dev                       # http://localhost:3000
```

Everything runs offline out of the box: the AI, payment, storage and
notification providers all default to development implementations, so you need
no API keys to see the whole product working.

### Demo accounts

Created by `npm run db:seed`. **Development only** — the password comes from
`SEED_DEMO_PASSWORD` (default `KaziOS-demo-2025`) and these accounts are flagged
`is_demo`, badged in the UI, and never created in production.

| Account | Role | What to look at |
| --- | --- | --- |
| `demo-worker@example.com` | Worker | Readiness breakdown, verified skills, earnings |
| `demo-employer@example.com` | Employer | Applicants with explained match scores, escrow, work review |
| `demo-admin@example.com` | Admin | North Star metric, moderation, disputes, fraud queue |

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run verify` | lint → typecheck → test → build (run this before pushing) |
| `npm test` | Vitest. Integration suites need `TEST_DATABASE_URL`; they skip without it |
| `npm run db:migrate` | Apply pending migrations (`-- --status` to list) |
| `npm run db:seed` | Seed demo data (`-- --reset` to clear first) |
| `npm run db:reset` | Drop and rebuild the schema (refuses to run in production) |
| `npm run gen:skills` | Regenerate the keyword index from the skills table |

---

## Architecture

```
src/
  app/                  Next.js App Router
    (public)/           Marketing, public job and task browsing
    (auth)/             Sign in, sign up
    worker/             Worker experience
    employer/           Employer experience
    admin/              Platform administration
    api/                REST API (72 route handlers)
  lib/
    ai/                 AI service, providers, schemas, prompts, safety
    auth/               Sessions, password hashing, RBAC, page guards
    db/                 PostgreSQL client, transactions, jsonb helper
    domain/             Business logic: accounts, workers, employers, opportunities,
                        applications, simulations
    matching/           Explainable matching engine
    readiness/          Work readiness scoring
    reputation/         Ratings with sufficient-data thresholds
    fraud/              Advisory fraud heuristics
    payments/           Provider abstraction + double-entry ledger
    storage/            File storage abstraction
    notifications/      Notification abstraction
    analytics/          Event pipeline and metric queries
    i18n/               English and Kiswahili
db/migrations/          Immutable, checksummed SQL migrations
tests/                  Unit and integration suites
docs/                   Architecture, API, database, AI, security, payments
```

### Every external dependency sits behind an interface

| Concern | Interface | Development | Production |
| --- | --- | --- | --- |
| AI | `AiProvider` | `DeterministicProvider` — a real rule-based engine, not fixtures | Anthropic Claude |
| Payments | `PaymentProvider` | `MockPaymentProvider` — full ledger, simulated settlement | M-Pesa (see `docs/PAYMENTS.md`) |
| Storage | `StorageProvider` | Local disk | Supabase Storage |
| Notifications | `DeliveryProvider` | Console | SMTP; SMS and WhatsApp are schema-ready |

Swapping a provider is one class and one environment variable. No business
logic changes.

---

## Product surfaces

**Worker** — onboarding that accepts *"I don't know what I can do"* as a valid
answer; CV analysis that shows you the exact line each skill came from; scored
work simulations; a transparent readiness score with the arithmetic on screen;
explained job and task matching; an interview simulator; a portfolio; escrowed
earnings; a career agent grounded in your own profile.

**Employer** — post a job or a task; describe a project in plain language and
get it broken into scoped, priced tasks for your approval; ranked applicants
with the reasoning shown; work review that releases payment on approval;
capability-based talent search; escrow-backed billing.

**Admin** — the North Star metric, the activation funnel, a moderation queue
for postings held before publication, dispute resolution that moves real money,
an advisory fraud queue, employer verification, and a full audit trail.

---

## What this build does not do

Stated plainly, because a demo that hides its edges is not useful:

- **M-Pesa is integration-ready, not integration-verified.** The Daraja request
  shapes are implemented and configured from the environment, but have not been
  exercised against a live sandbox. B2C payouts and reversals need credentials
  that are outside the MVP configuration surface. `docs/PAYMENTS.md` has the
  checklist. The provider refuses to start rather than silently failing.
- **SMTP delivery is not implemented.** The interface and configuration exist;
  the transport does not. It returns a loud failure rather than pretending to
  deliver — a password-reset email that silently vanishes is worse than an error.
- **CV text extraction reads plain text.** PDF and Word files are stored and
  downloadable by employers, but automatic extraction needs a parser
  dependency. The paste-your-CV path is the primary flow and works fully.
- **Embeddings are lexical, not semantic.** `src/lib/ai/embeddings.ts` uses a
  hashing trick — real, deterministic and free, but it will not know that
  "bookkeeping" and "reconciliation" are related. It is a tie-breaker only; the
  explainable feature-based matcher does the actual ranking. That file is the
  seam where a real embedding service plugs in.
- **pgvector is optional.** Migration `0009` upgrades to a native `vector`
  column with an HNSW index where the extension exists (Supabase); elsewhere it
  keeps `float8[]` and exact cosine similarity.

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, data flow, provider seams, scaling notes |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Schema, invariants enforced in the database, migration policy |
| [`docs/API.md`](docs/API.md) | Every endpoint, the response envelope, errors, pagination |
| [`docs/AI.md`](docs/AI.md) | Operations, prompt versioning, structured outputs, safety rules |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model and the controls answering each threat |
| [`docs/PAYMENTS.md`](docs/PAYMENTS.md) | Ledger design, escrow lifecycle, M-Pesa go-live checklist |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Vercel and Supabase setup, environment, runbook |

---

## Expanding beyond Kenya

Geography is modelled as `countries` + `regions`, not a hardcoded county list.
Uganda, Tanzania, Rwanda and Nigeria are already seeded as inactive rows with
their currency, dial prefix and regional label ("County", "District", "State").
Adding a market means activating a country and inserting its regions — no
schema change and no code change.

---

## Product principle

Every decision in this codebase was tested against one question:

> Does this increase the probability that a person can perform valuable work
> and get paid for it?

The objective is not more applications. It is **more people generating real
income**.
