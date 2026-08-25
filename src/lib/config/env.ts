/**
 * Environment configuration.
 *
 * Every secret enters the application through this module and nowhere else.
 * Values are parsed once, validated, and exposed as a frozen object so a typo
 * in a variable name fails at boot rather than at 2am in production.
 *
 * This file is server-only. Anything the browser legitimately needs must be
 * prefixed NEXT_PUBLIC_ and read from `publicEnv`.
 */
import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number.parseInt(v, 10)))
    .pipe(z.number().int());

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // A short secret is worse than no secret: it invites brute force on session
  // signatures. Refuse to boot rather than run with a weak one.
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters. Generate with: openssl rand -base64 48'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z.enum(['disable', 'require', 'prefer']).default('disable'),
  DATABASE_MAX_CONNECTIONS: int(10),

  AI_PROVIDER: z.enum(['anthropic', 'mock']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-sonnet-5'),
  AI_MAX_TOKENS: int(4096),
  AI_DAILY_REQUEST_LIMIT: int(60),

  STORAGE_PROVIDER: z.enum(['local', 'supabase']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage-uploads'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('kazios'),

  PAYMENT_PROVIDER: z.enum(['mock', 'mpesa']).default('mock'),
  PLATFORM_FEE_BPS: int(1000),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  MPESA_CALLBACK_URL: z.string().optional(),
  MPESA_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),

  NOTIFICATION_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: int(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  NOTIFICATION_FROM: z.string().default('KaziOS <no-reply@kazios.co.ke>'),

  SEED_DEMO_PASSWORD: z.string().default('KaziOS-demo-2025'),
  DEBUG_SQL: bool(false),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Parse and cache server environment. Throws a readable aggregate error listing
 * every problem at once, rather than failing on the first missing variable.
 */
export function getEnv(): ServerEnv {
  if (cached) return cached;

  // In test runs a throwaway secret is fine; production must supply a real one.
  const raw = { ...process.env };
  if (raw.NODE_ENV === 'test' && !raw.SESSION_SECRET) {
    raw.SESSION_SECRET = 'test-only-session-secret-that-is-long-enough-32';
  }

  const parsed = serverSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
  }

  const env = parsed.data;

  // Cross-field rules the schema cannot express on its own.
  if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY.');
  }
  if (env.STORAGE_PROVIDER === 'supabase' && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('STORAGE_PROVIDER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (env.NOTIFICATION_PROVIDER === 'smtp' && !env.SMTP_HOST) {
    throw new Error('NOTIFICATION_PROVIDER=smtp requires SMTP_HOST.');
  }
  if (env.PLATFORM_FEE_BPS < 0 || env.PLATFORM_FEE_BPS > 5000) {
    throw new Error('PLATFORM_FEE_BPS must be between 0 and 5000 (0%-50%).');
  }
  if (env.NODE_ENV === 'production') {
    if (env.SESSION_SECRET.startsWith('replace-me') || env.SESSION_SECRET.startsWith('test-only')) {
      throw new Error('Refusing to start in production with a placeholder SESSION_SECRET.');
    }
    if (env.PAYMENT_PROVIDER === 'mock') {
      // Loud, not fatal: a pilot may legitimately run without live payments,
      // but nobody should discover this by accident.
      console.warn(
        '[kazios] PAYMENT_PROVIDER=mock in production — no real money will move. ' +
          'See docs/PAYMENTS.md before going live.',
      );
    }
  }

  cached = Object.freeze(env);
  return cached;
}

/** Reset the cache. Test-only. */
export function resetEnvCache(): void {
  cached = null;
}

export const isProduction = () => getEnv().NODE_ENV === 'production';
export const isDevelopment = () => getEnv().NODE_ENV === 'development';
export const isTest = () => getEnv().NODE_ENV === 'test';

/** Values safe to expose to the browser. */
export const publicEnv = {
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
} as const;
