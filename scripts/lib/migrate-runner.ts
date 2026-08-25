/**
 * The migration engine, separated from the CLI.
 *
 * `scripts/migrate.ts` is the command-line front end; the integration test
 * harness calls `applyMigrations` directly so the test database is always at
 * the current schema. Both go through this one implementation, so the schema a
 * test runs against is the schema a deployment gets — there is no second,
 * drifting definition of "migrated".
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import postgres from 'postgres';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

export interface MigrationStatus {
  version: string;
  applied: boolean;
}

export interface MigrateOptions {
  /** Suppress per-migration progress output. */
  quiet?: boolean;
}

function sslMode(): 'require' | false {
  return process.env.DATABASE_SSL === 'require' ? 'require' : false;
}

function connect(url: string, quiet: boolean) {
  return postgres(url, {
    max: 1,
    ssl: sslMode(),
    onnotice: (n) => {
      if (n.message && !quiet) console.log(`   note: ${n.message}`);
    },
  });
}

async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
}

async function ensureRegistry(sql: postgres.Sql<Record<string, never>>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text        PRIMARY KEY,
      checksum    text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      duration_ms integer     NOT NULL DEFAULT 0
    )
  `;
}

/** Which migrations exist and which of them this database has already run. */
export async function migrationStatus(url: string): Promise<MigrationStatus[]> {
  const sql = connect(url, true);
  try {
    await ensureRegistry(sql);
    const applied = await sql<{ version: string }[]>`SELECT version FROM schema_migrations`;
    const appliedSet = new Set(applied.map((r) => r.version));
    return (await migrationFiles()).map((file) => {
      const version = file.replace(/\.sql$/, '');
      return { version, applied: appliedSet.has(version) };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Apply every unapplied migration in filename order, each in its own
 * transaction, recording a checksum. If a previously-applied file has been
 * edited the runner refuses to continue: silently diverging schemas between
 * environments is the failure mode this exists to prevent.
 *
 * Returns the number of migrations applied.
 */
export async function applyMigrations(url: string, options: MigrateOptions = {}): Promise<number> {
  const quiet = options.quiet ?? false;
  const sql = connect(url, quiet);

  try {
    await ensureRegistry(sql);

    const files = await migrationFiles();
    const applied = await sql<{ version: string; checksum: string }[]>`
      SELECT version, checksum FROM schema_migrations
    `;
    const appliedMap = new Map(applied.map((r) => [r.version, r.checksum]));

    let ran = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const body = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(body).digest('hex');
      const previous = appliedMap.get(version);

      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${version} has changed since it was applied.\n` +
              'Applied migrations are immutable — add a new migration instead of editing this one.',
          );
        }
        continue;
      }

      const started = Date.now();
      if (!quiet) process.stdout.write(`  applying ${version} ... `);
      // Each file runs as one transaction: a half-applied migration is worse
      // than a failed one.
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`
          INSERT INTO schema_migrations (version, checksum, duration_ms)
          VALUES (${version}, ${checksum}, ${Date.now() - started})
        `;
      });
      if (!quiet) console.log(`done (${Date.now() - started}ms)`);
      ran += 1;
    }

    return ran;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
