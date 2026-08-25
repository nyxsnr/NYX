/**
 * Vitest setup.
 *
 * Establishes a test environment that never touches production configuration:
 * deterministic AI and payment providers, a throwaway session secret, and a
 * database URL that must be explicitly provided for integration suites.
 */
// `NODE_ENV` is typed readonly, so assign through the index signature.
(process.env as Record<string, string>).NODE_ENV = 'test';
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
