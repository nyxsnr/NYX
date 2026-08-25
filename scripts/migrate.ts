/**
 * Migration runner (command line).
 *
 * The engine lives in scripts/lib/migrate-runner.ts so the integration test
 * harness applies the identical migrations. This file is the CLI around it.
 *
 *   npm run db:migrate
 *   npm run db:migrate -- --status
 */
import { loadEnv } from './lib/load-env';
import { applyMigrations, migrationStatus } from './lib/migrate-runner';

loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  if (process.argv.includes('--status')) {
    console.log('\nMigration status:\n');
    for (const { version, applied } of await migrationStatus(url)) {
      console.log(`  ${applied ? '[applied]' : '[pending]'} ${version}`);
    }
    console.log('');
    return;
  }

  const ran = await applyMigrations(url);
  console.log(ran === 0 ? '\nDatabase already up to date.\n' : `\nApplied ${ran} migration(s).\n`);
}

main().catch((err: unknown) => {
  console.error('\nMigration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
