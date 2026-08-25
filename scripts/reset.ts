/**
 * Drop and recreate the public schema, then re-run migrations.
 *
 * Guarded twice: it refuses to run against NODE_ENV=production, and refuses
 * any DATABASE_URL that does not look like a local or explicitly-confirmed
 * database unless --force is passed.
 *
 *   npm run db:reset
 */
import postgres from 'postgres';
import { spawnSync } from 'node:child_process';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to reset the database with NODE_ENV=production.');
    process.exit(1);
  }

  const looksLocal = /@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(url);
  if (!looksLocal && !process.argv.includes('--force')) {
    console.error(
      'DATABASE_URL does not look local. Re-run with --force if you really mean to wipe it.',
    );
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, ssl: process.env.DATABASE_SSL === 'require' ? 'require' : false });
  try {
    console.log('  dropping schema public ...');
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('  schema recreated.');
  } finally {
    await sql.end({ timeout: 5 });
  }

  const result = spawnSync('npx', ['tsx', 'scripts/migrate.ts'], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}

main().catch((err: unknown) => {
  console.error('Reset failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
