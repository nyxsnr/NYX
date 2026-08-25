/**
 * PostgreSQL access.
 *
 * A single pooled connection is shared per process and cached on globalThis so
 * Next.js hot reloads and serverless warm starts do not leak connections.
 *
 * All queries go through the tagged template (`sql`), which parameterises every
 * interpolation. String-concatenated SQL is never constructed anywhere in this
 * codebase — that is the SQL-injection guarantee, enforced by convention plus
 * the `sql.unsafe` ban in the ESLint config.
 */
import postgres from 'postgres';
import { getEnv } from '@/lib/config/env';

type Sql = postgres.Sql<Record<string, never>>;

const globalForDb = globalThis as unknown as { __kaziosSql?: Sql };

function createClient(): Sql {
  const env = getEnv();

  return postgres(env.DATABASE_URL, {
    max: env.DATABASE_MAX_CONNECTIONS,
    ssl: env.DATABASE_SSL === 'disable' ? false : env.DATABASE_SSL === 'require' ? 'require' : 'prefer',
    idle_timeout: 20,
    connect_timeout: 15,
    // Postgres enums and jsonb come back as parsed JS values.
    transform: { undefined: null },
    onnotice: env.DEBUG_SQL ? console.log : () => {},
    debug: env.DEBUG_SQL
      ? (_conn, query, params) => console.log('[sql]', query, params)
      : undefined,
  });
}

export const sql: Sql = globalForDb.__kaziosSql ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__kaziosSql = sql;
}

/**
 * Run a set of statements in a transaction.
 *
 * Anything that touches money, changes an application's status, or writes to
 * both a domain table and the ledger must go through here.
 */
export async function withTransaction<T>(
  fn: (tx: postgres.TransactionSql<Record<string, never>>) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => fn(tx as postgres.TransactionSql<Record<string, never>>)) as Promise<T>;
}

/**
 * Wrap a value destined for a `json`/`jsonb` column.
 *
 * IMPORTANT: do NOT write `${JSON.stringify(value)}::jsonb`. postgres.js knows
 * the target column is jsonb and serialises the parameter itself, so passing an
 * already-stringified value stores a JSON *string* (`"{\"a\":1}"`) rather than
 * an object — which then fails every `->>` lookup and every jsonb index.
 *
 * Use `${json(value)}` instead. It works for objects and arrays alike, and
 * inside transactions as well as on the pool.
 */
export function json(value: unknown) {
  return sql.json(value as never);
}

/** Close the pool. Used by scripts and test teardown. */
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
  if (globalForDb.__kaziosSql) delete globalForDb.__kaziosSql;
}

/** Cheap liveness probe for /api/health. */
export async function pingDb(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export type { Sql };
export type TxSql = postgres.TransactionSql<Record<string, never>>;
/** Either the pool or an open transaction — most query helpers accept both. */
export type Db = Sql | TxSql;
