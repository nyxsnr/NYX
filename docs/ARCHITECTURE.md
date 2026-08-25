# Architecture

## The shape of the system

KaziOS is a single Next.js application: App Router pages for the three
experiences, route handlers for the API, and a `lib/` layer that holds all the
business logic. There is no separate backend service, because at this stage a
second deployable would add operational cost without buying anything.

```
Browser
  │
  ├─ Server Components ──────────► lib/domain/*  ──► PostgreSQL
  │   (pages read directly)
  │
  └─ fetch → app/api/* ──────────► lib/domain/*  ──► PostgreSQL
      (mutations, client interactivity)             │
                                                    ├─► lib/ai        → Anthropic | deterministic
                                                    ├─► lib/payments  → M-Pesa | mock
                                                    ├─► lib/storage   → Supabase | local disk
                                                    └─► lib/analytics → analytics_events (+ PostHog)
```

**Reads happen in server components.** A page queries the domain layer directly
and renders HTML. No client-side data fetching on first paint, no loading
spinners, no waterfall — which matters when the median device is a mid-range
Android phone on mobile data.

**Writes go through the API.** Every mutation is a route handler declared with
`route()`, which applies origin and CSRF checks, rate limiting, authentication,
authorization and schema validation *before* the handler body runs. A new
endpoint cannot accidentally ship without them.

## Layers

| Layer | Responsibility | Rule |
| --- | --- | --- |
| `app/` | Rendering and HTTP | No SQL, no business rules |
| `lib/domain/` | Business logic and persistence | Owns transactions; the only layer that writes |
| `lib/{matching,readiness,reputation,fraud}/` | Pure scoring engines | No I/O — fully unit-testable |
| `lib/{ai,payments,storage,notifications}/` | External systems | Interface + implementations |
| `lib/db/` | PostgreSQL access | Tagged templates only |

The scoring engines are deliberately pure functions of a snapshot. That is what
makes it possible to unit-test the readiness score, explain it line by line to
a worker, and recompute it identically at any point in the future.

## Data flow: what happens when a worker applies

```
1. GET  /worker/jobs/[id]         Server component
   └─ buildMatchProfile(profileId)          → skills + evidence levels + simulation scores
   └─ jobRequirements(job)                  → required skills, logistics, pay
   └─ computeMatch(profile, requirements)   → score + reasons + gaps      [pure]
   └─ render the explanation                                              [no model involved]

2. POST /api/jobs/[id]/apply      Route handler
   └─ route() guards: CSRF → rate limit → auth → role → permission → zod
   └─ computeMatch(...) again, and store the result on the application
      (so the employer's view cannot drift as the profile changes later)
   └─ withTransaction:
        insert application
        increment job.application_count
        notify worker + employer
        track analytics event
```

The match score is computed twice on purpose: once to show the worker before
they commit, once at submission to freeze what the employer will see.

## The AI boundary

Nothing outside `lib/ai/` talks to a model.

```
Route handler
  └─ AIService.evaluateSimulation({ simulation, rubric, response, skillSlugs })
       └─ enforceDailyLimit(userId)              spend control
       └─ asUntrustedData('worker_response', …)  prompt-injection delimiting
       └─ provider.complete({ schema, … })       tool-call structured output
       └─ schema.safeParse(...)                  invalid → throw, never store
       └─ inspectAiOutput(...)                   prohibited claims → discard
       └─ logUsage(...)                          tokens, latency, outcome
```

Two properties follow from this shape:

- **A model can never write unvalidated data.** Output that fails its zod
  schema is a provider error, not a partially-populated profile.
- **Every durable judgement is traceable.** `ai_assessments` records the
  provider, model, prompt version, input digest and validated result, so any
  score shown to a user can be traced to what produced it. When a rubric or
  prompt changes, the version string changes with it — otherwise historical
  scores silently stop meaning what they meant.

The deterministic development provider is a genuine rule-based engine, not a
fixture file. It parses real CVs with real heuristics and scores real responses
against the real rubric. That means the demo behaves like production, tests
assert on behaviour rather than canned strings, and a broken prompt cannot hide
behind plausible-looking output.

## Money

The ledger is the source of truth, not a report over one.

```
initiateDeposit    provider → employer wallet: available += amount
holdInEscrow       employer: available → escrow      (one transaction)
                   worker:   pending  += net          (visible, not spendable)
releasePayment     employer: escrow  -= gross
                   worker:   pending -= net, available += net
                   platform: available += fee
refundPayment      employer: escrow → available (full or partial split)
requestPayout      worker: available -= amount, then provider call
```

Invariants are enforced by the database, not by hoping the application is
correct: amounts are `CHECK (amount > 0)`, balances are
`CHECK (balance >= 0)`, `net + fee = gross` is a table constraint, and a
trigger makes `transactions` append-only — the ledger cannot be rewritten, even
by us. Every movement locks the wallet row `FOR UPDATE` first, so two concurrent
releases cannot both read the same starting balance.

Provider calls happen *outside* the transaction and are reconciled by
reference, so a provider timeout cannot leave the ledger half-written. Payouts
credit the worker back if the provider call fails.

## Scaling notes

The current design is sized for a pilot, with the seams already in place:

| Constraint | Today | When it binds |
| --- | --- | --- |
| Rate limiting | Postgres table (survives serverless cold starts) | Swap the store for Redis; the interface is unchanged |
| Matching | SQL pre-filter to ≤200 candidates, then rank in memory | Move ranking into SQL, or use the pgvector ANN path to widen recall |
| Embeddings | Local hashing trick | Plug a real embedding service into `lib/ai/embeddings.ts` |
| Search | Postgres full-text + GIN | Dedicated search only if relevance demands it |
| AI cost | Per-user daily cap; simulation instances cached and reused | Batch, cache by input digest, or move cheap operations to a smaller model |

## Multi-market design

Geography is `countries` + `regions` rather than a hardcoded county list.
`countries` carries currency, dial prefix and the regional label — "County" in
Kenya, "District" in Uganda, "State" in Nigeria — so the UI adapts from data.
Money is stored as integer minor units with an explicit currency code
everywhere; no float arithmetic touches money anywhere in the codebase.

Adding a market is: activate the country row, insert its regions. No schema
change, no code change.

## Internationalisation

`lib/i18n` holds typed dictionaries for English and Kiswahili. The dictionary
type is derived from the English keys, so a missing translation is a compile
error rather than a blank label discovered in production. Adding a language is
one file.
