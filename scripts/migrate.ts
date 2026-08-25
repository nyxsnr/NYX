/**
 * Migration runner.
 *
 * Applies every unapplied file in db/migrations in filename order, each inside
 * its own transaction, recording a checksum. If a previously-applied file has
 * been edited the runner refuses to continue: silently diverging schemas
 * between environments is the failure mode this exists to prevent.
 *
 *   npm run db:migrate
 *   npm run db:migrate -- --status
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import postgres from 'postgres';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  const statusOnly = process.argv.includes('--status');
  const sql = postgres(url, {
    max: 1,
    ssl: process.env.DATABASE_SSL === 'require' ? 'require' : false,
    onnotice: (n) => {
      if (n.message) console.log(`   note: ${n.message}`);
    },
  });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     text        PRIMARY KEY,
        checksum    text        NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now(),
        duration_ms integer     NOT NULL DEFAULT 0
      )
    `;

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const applied = await sql<{ version: string; checksum: string }[]>`
      SELECT version, checksum FROM schema_migrations
    `;
    const appliedMap = new Map(applied.map((r) => [r.version, r.checksum]));

    if (statusOnly) {
      console.log('\nMigration status:\n');
      for (const file of files) {
        const version = file.replace(/\.sql$/, '');
        console.log(`  ${appliedMap.has(version) ? '[applied]' : '[pending]'} ${version}`);
      }
      console.log('');
      return;
    }

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
      process.stdout.write(`  applying ${version} ... `);
      // Each file runs as one transaction: a half-applied migration is worse
      // than a failed one.
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`
          INSERT INTO schema_migrations (version, checksum, duration_ms)
          VALUES (${version}, ${checksum}, ${Date.now() - started})
        `;
      });
      console.log(`done (${Date.now() - started}ms)`);
      ran += 1;
    }

    console.log(ran === 0 ? '\nDatabase already up to date.\n' : `\nApplied ${ran} migration(s).\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error('\nMigration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
