/**
 * Password hashing (scrypt).
 *
 * scrypt is memory-hard and ships in Node's standard library, so there is no
 * native dependency to break on Vercel. Parameters are stored inside the hash
 * string, which means they can be raised later and old hashes still verify —
 * `needsRehash` tells the login path when to transparently upgrade one.
 *
 * Format: scrypt$N$r$p$<salt-b64>$<hash-b64>
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const CURRENT = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt needs roughly 128 * N * r bytes; give it headroom or Node refuses.
const maxmem = (N: number, r: number) => 256 * N * r;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * Reject the passwords that actually get people compromised, without imposing
 * character-class rules that push users toward "Password1!".
 */
export function validatePasswordStrength(password: string, context: { email?: string; name?: string } = {}) {
  const problems: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  }

  const lower = password.toLowerCase();
  const common = [
    'password', '12345678', 'qwerty', 'letmein', 'welcome', 'admin123',
    'kazios', 'kenya', 'nairobi', 'iloveyou', '123456789', 'abc12345',
  ];
  if (common.some((c) => lower.includes(c))) {
    problems.push('This password is too easy to guess. Choose something less common.');
  }

  const emailLocal = context.email?.split('@')[0]?.toLowerCase();
  if (emailLocal && emailLocal.length >= 4 && lower.includes(emailLocal)) {
    problems.push('Your password should not contain your email address.');
  }
  if (context.name) {
    const parts = context.name.toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
    if (parts.some((p) => lower.includes(p))) {
      problems.push('Your password should not contain your name.');
    }
  }
  if (/^(.)\1+$/.test(password)) {
    problems.push('Your password cannot be a single repeated character.');
  }

  return { valid: problems.length === 0, problems };
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length > PASSWORD_MAX_LENGTH) {
    // Bounded input keeps scrypt's cost predictable and blocks a trivial DoS.
    throw new Error('Password exceeds maximum length.');
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    ...CURRENT,
    maxmem: maxmem(CURRENT.N, CURRENT.r),
  });
  return [
    'scrypt',
    CURRENT.N,
    CURRENT.r,
    CURRENT.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Constant-time verification. Returns false for malformed hashes rather than
 * throwing, so a corrupted row cannot be used to distinguish accounts.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (password.length > PASSWORD_MAX_LENGTH) return false;

    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4] as string, 'base64');
    const expected = Buffer.from(parts[5] as string, 'base64');

    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    // Refuse absurd parameters from a tampered row: they would hang the process.
    if (N < 1024 || N > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 16) return false;
    if (expected.length === 0) return false;

    const derived = await scrypt(password, salt, expected.length, { N, r, p, maxmem: maxmem(N, r) });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash uses weaker parameters than the current policy. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number(parts[1]) < CURRENT.N || Number(parts[2]) < CURRENT.r || Number(parts[3]) < CURRENT.p;
}
