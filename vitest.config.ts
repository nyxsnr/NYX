import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Applies migrations to TEST_DATABASE_URL before any suite runs, so the
    // integration suites work against an empty database.
    globalSetup: ['tests/global-setup.ts'],
    // Integration tests share one Postgres database; run files serially so
    // truncation in one suite cannot race another suite's fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` is a build-time marker that throws when evaluated outside
      // a React Server Component. Under Vitest it resolves to the same no-op
      // module Next.js uses on the server.
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
});
