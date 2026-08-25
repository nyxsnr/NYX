# API reference

Every endpoint returns the same envelope, so a client can branch on the
presence of `error` alone.

```jsonc
// success
{ "data": { … }, "meta": { "page": 1, "pageSize": 20, "total": 84, "totalPages": 5, "hasMore": true } }

// failure
{ "error": { "code": "VALIDATION_FAILED", "message": "Please correct the highlighted fields.",
             "fields": { "email": ["Enter a valid email address."] }, "requestId": "…" } }
```

## Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Malformed request |
| `UNAUTHENTICATED` | 401 | No valid session |
| `INSUFFICIENT_FUNDS` | 402 | Balance too low to fund the operation |
| `FORBIDDEN` | 403 | Authenticated, but not permitted |
| `NOT_FOUND` | 404 | Absent, or not visible to this actor |
| `CONFLICT` | 409 | Violates current state (duplicate application, invalid transition) |
| `PRECONDITION_FAILED` | 412 | A prerequisite is unmet (`details.requires` names it) |
| `PAYLOAD_TOO_LARGE` | 413 | Body or file exceeds the limit |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Wrong content type |
| `VALIDATION_FAILED` | 422 | Schema validation failed; see `fields` |
| `RATE_LIMITED` | 429 | Too many requests; see `Retry-After` |
| `INTERNAL_ERROR` | 500 | Unexpected. The message is generic by design — never a stack trace |
| `NOT_IMPLEMENTED` | 501 | Integration pending (e.g. M-Pesa payouts) |
| `PROVIDER_ERROR` | 502 | An upstream provider failed |
| `AI_UNAVAILABLE` | 503 | The AI provider is unreachable or returned unsafe output |

## Conventions

- **Auth** — httpOnly session cookie. Mutations additionally require the
  `x-kazios-csrf` header, whose value the browser reads from the `kazios_csrf`
  cookie.
- **Money** — always integer minor units (KES cents). `4500000` is KES 45,000.
- **Pagination** — `?page=1&pageSize=20` (max 100). Totals come back in `meta`.
- **Idempotency** — money-moving endpoints take a client-generated UUID
  `idempotencyKey`. Retrying with the same key returns the original result
  rather than charging twice.

---

## Public

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness plus which providers are live |
| `GET` | `/api/reference/skills` | Skill taxonomy. `?category=`, `?q=` |
| `GET` | `/api/reference/regions` | Regions for a market. `?country=KE` |
| `GET` | `/api/jobs` | Job search. `?q &category &regionId &workArrangement &employmentType &minSalary &skills` |
| `GET` | `/api/jobs/:id` | One job. Signed-in workers also get their explained match |
| `GET` | `/api/tasks` | Task search. `?q &category &regionId &minBudget &maxBudget &requiresLaptop &skills` |
| `GET` | `/api/tasks/:id` | One task, including the net-to-worker figure after platform fee |

## Authentication

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | `{ email, password, fullName, role, phone?, companyName?, acceptedTerms }` |
| `POST` | `/api/auth/login` | Wrong password and unknown account return identical errors |
| `POST` | `/api/auth/logout` | Revokes the session server-side |
| `GET` | `/api/auth/me` | Current session, or `{ user: null }` — never 401 |
| `POST` | `/api/auth/password` | Changes the password; revokes all other sessions |
| `POST` | `/api/auth/verify/send` | `{ kind: "EMAIL" \| "PHONE" }` |
| `POST` | `/api/auth/verify/confirm` | `{ kind, code }`. Five attempts, then the code is burned |

## Worker

| Method | Path | Notes |
| --- | --- | --- |
| `GET` `PATCH` | `/api/worker/profile` | Partial update; omitted fields are untouched |
| `GET` `POST` `DELETE` | `/api/worker/skills` | Added as `SELF_REPORTED`. Verified skills cannot be deleted |
| `GET` | `/api/worker/readiness` | Full component breakdown and improvement actions. `?refresh=true` |
| `GET` `POST` | `/api/worker/cv` | Multipart upload |
| `POST` | `/api/worker/cv/text` | Paste CV text — the primary path on mobile |
| `GET` `POST` | `/api/worker/assessment` | Capability assessment; writes `AI_INFERRED` skills |
| `GET` | `/api/worker/recommendations` | Matched jobs, tasks and simulations with reasons |
| `GET` | `/api/worker/applications` | Job and task applications |
| `GET` | `/api/worker/simulations` | Templates, history and what to try next |
| `POST` | `/api/worker/simulations/attempts` | `{ templateSlug }` — starts or resumes an attempt |
| `GET` `POST` | `/api/worker/simulations/attempts/:id` | Fetch, or submit for scoring |
| `GET` `POST` | `/api/worker/portfolio` | |
| `DELETE` | `/api/worker/portfolio/:id` | Soft delete, scoped to the owner |
| `GET` `POST` | `/api/worker/interview` | List sessions; start one |
| `GET` `POST` | `/api/worker/interview/:id` | Transcript; answer the current question |
| `GET` | `/api/worker/earnings` | Wallet, ledger and escrowed work |
| `POST` | `/api/worker/payouts` | Requires a verified phone number |
| `GET` `POST` | `/api/worker/agent` | Career agent, grounded in the worker's own profile |
| `GET` | `/api/worker/work/:id` | One assignment, with escrow status |
| `POST` | `/api/worker/work/:id/submit` | Submit work for review |
| `POST` | `/api/jobs/:id/apply` | Stores the match score and explanation |
| `POST` | `/api/tasks/:id/apply` | |
| `POST` | `/api/tasks/:id/proposal-draft` | Draft grounded strictly in profile evidence |

## Employer

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/employer/dashboard` | Counts, wallet, and what is blocking a worker |
| `GET` `PATCH` | `/api/employer/company` | Owner sees their own registration identifiers |
| `GET` `POST` | `/api/employer/jobs` | Screened on create; risky postings are held |
| `GET` `PATCH` `DELETE` | `/api/employer/jobs/:id` | Held postings cannot be self-published |
| `GET` | `/api/employer/jobs/:id/applicants` | Ranked, with reasoning. Marks unseen as viewed |
| `PATCH` | `/api/employer/applications/:id` | `{ status, notes?, rejectionReason? }` |
| `GET` `POST` | `/api/employer/tasks` | Publishing checks the balance covers the commitment |
| `GET` `PATCH` | `/api/employer/tasks/:id` | Includes assigned workers |
| `GET` | `/api/employer/tasks/:id/applicants` | Discloses AI-assisted proposals |
| `POST` | `/api/employer/task-applications/:id/accept` | Assigns **and** funds escrow atomically |
| `GET` | `/api/employer/work/:id` | Assignment and submission history |
| `POST` | `/api/employer/submissions/:id/approve` | Approves **and** releases payment |
| `POST` | `/api/employer/submissions/:id/revision` | Requires substantive notes |
| `GET` | `/api/employer/talent` | Capability search over opted-in workers |
| `GET` | `/api/employer/billing` | Wallet, escrow commitments, transactions |
| `POST` | `/api/employer/billing/deposit` | Idempotent top-up |
| `POST` | `/api/employer/ai/job-description` | Strips unlawful requirements and says so |
| `POST` | `/api/employer/ai/decompose` | Project → proposed tasks. Publishes nothing |
| `GET` | `/api/employer/projects` | |
| `POST` | `/api/employer/projects/:id/approve` | Creates the tasks the employer kept |

## Shared

| Method | Path | Notes |
| --- | --- | --- |
| `GET` `POST` | `/api/notifications` | List; mark one or all read |
| `POST` | `/api/reviews` | Must be anchored to approved work |
| `GET` `POST` | `/api/disputes` | Opening one freezes the escrowed funds |
| `GET` | `/api/files/:id` | Authorization checked in SQL; served as an attachment |

## Admin

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/metrics` | North Star, activation funnel, marketplace, money |
| `GET` | `/api/admin/users` | `?q &role &status &flagged` |
| `GET` `PATCH` | `/api/admin/users/:id` | Moderation requires a written reason, sent to the user |
| `GET` `POST` | `/api/admin/moderation` | Held postings and user reports |
| `GET` | `/api/admin/disputes` | Oldest first — someone is waiting on their pay |
| `PATCH` | `/api/admin/disputes/:id` | Release, refund or split. Moves real money |
| `GET` | `/api/admin/fraud` | Advisory signals |
| `PATCH` | `/api/admin/fraud/:id` | Confirming records a finding; it does not restrict anyone |
| `GET` | `/api/admin/verifications` | Employer verification queue |
| `PATCH` | `/api/admin/verifications/:id` | |
| `GET` | `/api/admin/audit` | Audit trail |

## Scheduled

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/cron/housekeeping` | Bearer `CRON_SECRET`, compared in constant time |

---

## Rate limits

Applied per IP, or per user where the cost is per-user.

| Policy | Limit | Window | Applies to |
| --- | --- | --- | --- |
| `login` | 8 | 5 min | Sign-in (cleared on success) |
| `signup` | 5 | 1 hour | Registration |
| `verification` | 6 | 10 min | Code send and confirm |
| `ai` | 30 | 1 hour | Standard AI operations |
| `aiHeavy` | 10 | 1 hour | CV analysis, assessment, evaluation, decomposition |
| `upload` | 20 | 1 hour | File uploads |
| `apply` | 40 | 1 hour | Applications |
| `write` | 120 | 1 min | General mutations |
| `read` | 600 | 1 min | General reads |

A separate per-user daily cap (`AI_DAILY_REQUEST_LIMIT`, default 60) bounds AI
spend across all operations.
