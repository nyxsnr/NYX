# Deployment

Target: **Vercel** for the application, **Supabase** (or any managed
PostgreSQL) for data and file storage.

## 1. Database

Create a Supabase project, then enable pgvector — migration `0009` uses it if
present and falls back cleanly if not:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Apply migrations using the **direct** (non-pooled) connection string:

```bash
DATABASE_URL="postgresql://…@db.…supabase.co:5432/postgres" \
DATABASE_SSL=require \
npm run db:migrate
```

This creates the schema, the 76-skill taxonomy and the 20 simulation templates.
`db:seed` is development-only and refuses to run with `NODE_ENV=production`.

## 2. Storage

Create a Supabase Storage bucket named `kazios`. Keep it **private** — files
are served through `/api/files/:id`, which checks authorization in SQL and
serves everything as an attachment with `nosniff`.

## 3. Environment

In Vercel → Settings → Environment Variables:

```bash
NODE_ENV=production
APP_URL=https://your-domain

# Generate: openssl rand -base64 48
SESSION_SECRET=…

# Pooled connection for the app (port 6543 on Supabase)
DATABASE_URL=postgresql://…@…pooler.supabase.com:6543/postgres
DATABASE_SSL=require
DATABASE_MAX_CONNECTIONS=10

AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=…
AI_MODEL=claude-sonnet-5
AI_DAILY_REQUEST_LIMIT=60

STORAGE_PROVIDER=supabase
SUPABASE_URL=https://….supabase.co
SUPABASE_SERVICE_ROLE_KEY=…          # server-only; never NEXT_PUBLIC_
SUPABASE_STORAGE_BUCKET=kazios

PAYMENT_PROVIDER=mock                 # see docs/PAYMENTS.md before changing
PLATFORM_FEE_BPS=1000

NOTIFICATION_PROVIDER=console         # SMTP transport not implemented yet
NOTIFICATION_FROM="KaziOS <no-reply@your-domain>"

# Generate: openssl rand -hex 32
CRON_SECRET=…

NEXT_PUBLIC_POSTHOG_KEY=…             # optional
```

`getEnv()` validates everything at boot and refuses to start in production with
a placeholder `SESSION_SECRET`. It warns loudly if left on a development
payment provider.

Use the **pooled** connection string for the app (serverless opens many short
connections) and the **direct** one for migrations.

## 4. Deploy

```bash
vercel --prod
```

`vercel.json` sets the region to `fra1` (lowest latency to East Africa of the
standard regions), raises the timeout to 60s for the AI-heavy routes, and
registers the nightly housekeeping cron.

## 5. Verify

```bash
curl https://your-domain/api/health
```

```jsonc
{ "data": { "status": "ok",
  "checks": { "database": true,
              "ai": { "provider": "anthropic", "live": true },
              "payments": { "provider": "mock", "live": false },
              "storage": { "provider": "supabase" } } } }
```

Then check by hand: the landing page renders, sign-up works, a worker can
complete a simulation, an employer can post a task, and `/admin` shows the
North Star metric.

## Before pushing

```bash
npm run verify     # lint → typecheck → test → build
```

Integration tests need a database:

```bash
createdb kazios_test
TEST_DATABASE_URL=postgresql://localhost/kazios_test npm run db:migrate
TEST_DATABASE_URL=postgresql://localhost/kazios_test npm test
```

Without `TEST_DATABASE_URL` the integration suites skip and the unit suites
still run, so CI without a database is not a failure.

## Runbook

| Symptom | First check |
| --- | --- |
| 503 on `/api/health` | `DATABASE_URL`, and whether Supabase is paused |
| "too many connections" | Use the pooled string; lower `DATABASE_MAX_CONNECTIONS` |
| `AI_UNAVAILABLE` | `ANTHROPIC_API_KEY`; then `ai_usage` for `error_code` |
| Payments stuck `PROCESSING` | Provider callback delivery; re-run `confirmDeposit` |
| Wallet mismatch | Run `reconcileWallet()`. **Treat as a serious incident** |
| Slow job listings | Confirm `idx_jobs_published` is being used |
| Migration refuses to apply | An applied file was edited. Restore it and add a new migration |

## Scheduled work

`/api/cron/housekeeping` runs nightly at 02:00 UTC and purges expired sessions
and old rate-limit rows, and expires stale simulation attempts. It authenticates
with `CRON_SECRET` compared in constant time.

## Rollback

Vercel keeps previous deployments; promote an earlier one to roll back the
application. **Database migrations do not roll back automatically** — write a
forward migration that reverses the change. Applied migrations are immutable by
design.
