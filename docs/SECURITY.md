# Security

The threat model that shaped this codebase, and the control answering each
threat. Where something is not yet done, it says so.

## Who this protects

The people most at risk here are workers: unemployed or underemployed, often
new to formal hiring, and disproportionately targeted by employment scams. A
security failure on this platform is not an inconvenience — it is somebody's
rent. That framing drives several decisions that would otherwise look strict.

---

## Authentication

| Threat | Control |
| --- | --- |
| Password database leak | scrypt (N=16384, r=8, p=1), 16-byte random salt, 64-byte key. Parameters stored in the hash so they can be raised later; `needsRehash` upgrades transparently on next sign-in |
| Session cookie theft from a DB dump | Only `sha256(token)` is stored. A dump yields no usable cookies |
| Forged session cookies | Cookie is `<token>.<hmac>`; a bad signature is rejected before any DB hit |
| Session fixation | A new token is issued on sign-in and on password change |
| Indefinite sessions | 30-day sliding idle expiry, 90-day absolute cap |
| Credential stuffing | 8 failures → 15-minute lockout; rate limited per IP |
| Account enumeration | Wrong password and unknown account return **identical** messages, and the unknown path still runs a scrypt verification so timing matches |
| Stale access after compromise | Password change revokes every session; admin suspension revokes immediately |

**Not yet implemented:** MFA, and password reset by email (blocked on the SMTP
transport — see below).

## Authorization

Never trusted from the client. Role and permissions come from the session row,
re-read from the database on every request.

- `route()` enforces role and permission before the handler body runs.
- Page layouts call `requireAuth([...roles])`, which redirects rather than
  rendering a dead end.
- Ownership is enforced **in the WHERE clause**, not in a post-fetch check —
  `UPDATE portfolio_items … WHERE id = $1 AND worker_profile_id = $2` cannot
  leak a row it did not match.
- File downloads check authorization in SQL: owner, admin, or an employer with
  a live application or assignment from that worker.

## Injection

| Threat | Control |
| --- | --- |
| SQL injection | Every query is a postgres.js tagged template; interpolations are parameterised. `sql.unsafe()` is banned in `src/` by an ESLint rule, permitted only in the migration runner |
| XSS | React escapes by default; no `dangerouslySetInnerHTML` anywhere; a strict CSP is set in `next.config.ts` |
| Stored XSS via upload | Magic-number validation, generated storage keys, `X-Content-Type-Options: nosniff`, and `Content-Disposition: attachment` on every download |
| Prompt injection | User content is delimited, labelled untrusted, length-capped, and kept out of the structured payload |
| Open redirect | `next=` parameters are honoured only for same-site paths |

## CSRF

Three layers: `SameSite=Lax` cookies, an origin check on every mutation, and a
double-submit token (`x-kazios-csrf`) derived by HMAC from the session token, so
it cannot be replayed across sessions.

## Rate limiting

Backed by a Postgres table rather than memory — an in-process counter on
serverless resets on every cold start and protects nothing. Login, signup and
verification are strict; AI operations are limited per user because they cost
real money.

A successful sign-in clears the IP's failure budget, so one person's typos do
not lock out a shared connection at a cyber café.

## Money

| Threat | Control |
| --- | --- |
| Double spend | Wallet rows locked `FOR UPDATE`; balances CHECK-constrained non-negative |
| Double charge on retry | `UNIQUE (idempotency_key)`; a repeat returns the original result |
| Webhook replay | `UNIQUE (provider, provider_reference)`; and a webhook body is never proof of payment — the provider is always re-queried before crediting |
| Ledger tampering | `transactions` is append-only, enforced by trigger |
| Partial writes | Money only moves inside a transaction; provider calls happen outside it and are reconciled by reference |
| Unfunded work | Publishing a task and accepting a worker both check the balance covers the commitment; if escrow cannot be funded, nobody is assigned |
| Payout to the wrong number | Withdrawal requires a verified phone; a failed provider call credits the wallet back |

No card number, PIN or payer credential is stored anywhere. M-Pesa customers
authorise on their own handset.

## Fraud and abuse

Everything in `src/lib/fraud` is **advisory**. No code path anywhere suspends
an account from a heuristic or an AI score. That is deliberate: a false
positive here cuts off someone's income, and an automated ban on a livelihood
platform is a harm in its own right.

- Postings are screened before publication. Advance-fee demands, credential
  requests and off-platform pressure are CRITICAL and escalate on their own —
  they do not have to accumulate alongside lesser signals to be seen.
- Discriminatory requirements are stripped from AI-drafted postings, not merely
  warned about, and the employer is told why with the legal basis.
- Shared-IP signals are explicitly weighted low, because shared connections are
  normal at cyber cafés and on carrier NAT in Kenya.
- Suspending an account requires a named admin, a written reason, and the
  person is notified and can appeal.

## Privacy

Worker defaults are conservative: phone, exact location and earnings are
private. Public profiles show a first name plus surname initial until an
employer engages.

Age bracket and employment status are **never** published — they are matching
inputs, and publishing them would invite exactly the discrimination the
platform refuses to model. Company registration numbers and KRA PINs are held
for verification review and excluded from every public serializer.

Analytics scrubs email, phone, name and CV text before writing an event. The
audit log redacts passwords, tokens, codes and secrets.

## Secrets

All configuration flows through `getEnv()`, validated once at boot. The
service-role key is only ever read in `server-only` modules. Production refuses
to start with a placeholder `SESSION_SECRET`, and warns loudly if left on a
development payment provider.

## Auditability

Every privileged and money-moving action writes to `audit_log`: actor, role,
action, entity, redacted metadata, IP. Every durable AI judgement writes to
`ai_assessments` with its provider, model, prompt version and input digest.

## Known gaps

Stated rather than hidden:

1. **No MFA.** Should come before scale, especially for admin accounts.
2. **No password reset flow.** Blocked on the SMTP transport.
3. **SMTP is not implemented.** It fails loudly rather than pretending to send.
4. **M-Pesa callbacks are unauthenticated by design** (Daraja does not sign
   them). The code treats a callback as a hint and re-verifies before crediting,
   but IP allowlisting should be added at the edge before go-live.
5. **No automated dependency scanning** in CI yet.
6. **Rate limiting is per-instance-shared but not distributed-lock-based** —
   a burst across instances at a window boundary can exceed the nominal limit.

## Reporting a vulnerability

Do not open a public issue. Contact the maintainers directly with reproduction
steps and the affected version.
