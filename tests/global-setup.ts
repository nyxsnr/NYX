/**
 * Vitest global setup.
 *
 * Brings the test database to the current schema before any suite runs.
 *
 * Without this, setting TEST_DATABASE_URL — the documented way to switch the
 * integration suites on — turns 39 skipped tests into 39 failures reading
 * `relation "transactions" does not exist`, because nothing had ever created
 * the schema in that database. Migrating here means the integration suites are
 * self-sufficient: point them at an empty database and they work.
 *
 * It runs once per `vitest` invocation, in the main process, before workers
 * start. Migrations are idempotent, so a database that is already current
 * costs one round trip.
 */
import { loadEnv } from '../scripts/lib/load-env';
import { applyMigrations } from '../scripts/lib/migrate-runner';

// Only TEST_DATABASE_URL is imported from the env files: inheriting the
// development DATABASE_URL would point the suites — which truncate every table
// between tests — at the developer's own data.
loadEnv({ only: ['TEST_DATABASE_URL'] });

export async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  // Unset is the supported "no Postgres here" case: the integration suites skip
  // themselves and the unit suites run as normal.
  if (!url) return;

  try {
    const ran = await applyMigrations(url, { quiet: true });
    if (ran > 0) console.log(`[tests] applied ${ran} migration(s) to the test database`);
  } catch (err) {
    // Fail loudly and specifically. The alternative is 39 confusing
    // "relation does not exist" failures that look like application bugs.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not migrate the test database at TEST_DATABASE_URL.\n${message}\n\n` +
        'Check that the database exists and is reachable, or unset TEST_DATABASE_URL ' +
        'to skip the integration suites.',
    );
  }
}
