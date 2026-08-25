/**
 * Vitest setup.
 *
 * Establishes a test environment that never touches production configuration:
 * deterministic AI and payment providers, a throwaway session secret, and a
 * database URL that must be explicitly provided for integration suites.
 */
import { loadEnv } from '../scripts/lib/load-env';

// `NODE_ENV` is typed readonly, so assign through the index signature.
(process.env as Record<string, string>).NODE_ENV = 'test';

// Let `.env.local` switch the integration suites on, so a developer who has set
// TEST_DATABASE_URL there does not also have to export it. Nothing else is
// imported from those files: the development DATABASE_URL must never reach a
// suite that truncates every table between tests.
loadEnv({ only: ['TEST_DATABASE_URL'] });
process.env.SESSION_SECRET ??= 'vitest-session-secret-long-enough-for-validation-12345';
process.env.AI_PROVIDER = 'mock';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.STORAGE_PROVIDER = 'local';
process.env.NOTIFICATION_PROVIDER = 'console';
process.env.APP_URL ??= 'http://localhost:3000';
// Integration suites use TEST_DATABASE_URL when set, and skip themselves
// otherwise, so `npm test` passes on a machine with no Postgres.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.DATABASE_URL ??= 'postgresql://postgres@127.0.0.1:5432/kazios_test';
