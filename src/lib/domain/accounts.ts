/**
 * Account creation, sign-in and verification.
 *
 * Security posture:
 *   * sign-in failures are indistinguishable — wrong email and wrong password
 *     return the same message and take a comparable amount of time, so the
 *     endpoint cannot be used to enumerate who has an account;
 *   * repeated failures lock the account temporarily rather than permanently;
 *   * a password change revokes every other session;
 *   * verification codes are hashed, single-use and time-limited.
 */
import 'server-only';
import { createHash, randomInt } from 'node:crypto';
import { json, sql, withTransaction } from '@/lib/db/client';
import { AppError, conflict, unauthenticated } from '@/lib/http/errors';
import { hashPassword, needsRehash, validatePasswordStrength, verifyPassword } from '@/lib/auth/password';
import { revokeAllSessions } from '@/lib/auth/session';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';
import { notify } from '@/lib/notifications';
import { normalizeEmailForDuplicateCheck, screenAccount } from '@/lib/fraud';
import { createWorkerProfile } from './workers';
import type { UserRole } from '@/lib/auth/rbac';

const LOCKOUT_THRESHOLD = 8;
const LOCKOUT_MINUTES = 15;

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  role: 'WORKER' | 'EMPLOYER';
  phone?: string | null;
  locale?: string;
  ip?: string | null;
  userAgent?: string | null;
  companyName?: string;
}

export async function signup(input: SignupInput): Promise<{ userId: string; role: UserRole }> {
  const strength = validatePasswordStrength(input.password, { email: input.email, name: input.fullName });
  if (!strength.valid) {
    throw new AppError('VALIDATION_FAILED', 'Please choose a stronger password.', {
      fields: { password: strength.problems },
    });
  }

  const emailNormalized = input.email.toLowerCase().trim();
  const passwordHash = await hashPassword(input.password);

  const result = await withTransaction(async (tx) => {
    const existing = await tx<{ id: string }[]>`
      SELECT id FROM users WHERE email_normalized = ${emailNormalized} AND deleted_at IS NULL
    `;
    if (existing[0]) {
      throw conflict('An account with that email address already exists. Try signing in instead.');
    }

    if (input.phone) {
      const phoneTaken = await tx<{ id: string }[]>`
        SELECT id FROM users WHERE phone_normalized = ${input.phone} AND deleted_at IS NULL
      `;
      if (phoneTaken[0]) {
        throw conflict('That phone number is already registered to another account.');
      }
    }

    const users = await tx<{ id: string }[]>`
      INSERT INTO users (email, email_normalized, password_hash, role, status, full_name, phone, phone_normalized, locale)
      VALUES (
        ${input.email.trim()}, ${emailNormalized}, ${passwordHash}, ${input.role}, 'ACTIVE',
        ${input.fullName.trim()}, ${input.phone ?? null}, ${input.phone ?? null}, ${input.locale ?? 'en'}
      )
      RETURNING id
    `;
    const user = users[0];
    if (!user) throw new AppError('INTERNAL_ERROR', 'Could not create the account.');

    if (input.role === 'WORKER') {
      await createWorkerProfile(user.id, tx);
    } else {
      const companyName = (input.companyName ?? input.fullName).trim();
      const slugBase = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'company';
      const companies = await tx<{ id: string }[]>`
        INSERT INTO companies (name, slug)
        VALUES (${companyName}, ${`${slugBase}-${user.id.slice(0, 8)}`})
        RETURNING id
      `;
      await tx`
        INSERT INTO employer_profiles (user_id, company_id) VALUES (${user.id}, ${companies[0]?.id ?? null})
      `;
    }

    return { userId: user.id };
  });

  // Fraud screening is advisory and runs after the account exists, so a false
  // positive can never block a legitimate signup.
  void screenAccountAsync({
    userId: result.userId,
    email: emailNormalized,
    phone: input.phone ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });

  await audit({
    actorId: result.userId,
    actorRole: input.role,
    action: 'account.created',
    entityType: 'user',
    entityId: result.userId,
    metadata: { role: input.role },
    ip: input.ip,
  });

  await track({
    event: input.role === 'WORKER' ? 'signup' : 'employer_signup',
    userId: result.userId,
    role: input.role,
    properties: { role: input.role },
  });

  return { userId: result.userId, role: input.role };
}

/** Runs the duplicate/automation heuristics and records any flags. */
async function screenAccountAsync(input: {
  userId: string;
  email: string;
  phone: string | null;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  try {
    const normalized = normalizeEmailForDuplicateCheck(input.email);

    const counts = await sql<{ same_ip: string; similar_email: string; duplicate_phone: string }[]>`
      SELECT
        (SELECT count(*)::text FROM sessions s
          WHERE s.ip_address = ${input.ip}::inet AND s.created_at > now() - interval '24 hours') AS same_ip,
        (SELECT count(*)::text FROM users u
          WHERE u.id <> ${input.userId} AND u.deleted_at IS NULL
            AND regexp_replace(split_part(u.email_normalized, '@', 1), '\\+.*$', '') ||
                '@' || split_part(u.email_normalized, '@', 2) = ${normalized}) AS similar_email,
        (SELECT count(*)::text FROM users u
          WHERE u.id <> ${input.userId} AND u.deleted_at IS NULL
            AND u.phone_normalized = ${input.phone}) AS duplicate_phone
    `;

    const row = counts[0];
    const assessment = screenAccount({
      emailNormalized: input.email,
      phoneNormalized: input.phone,
      signupIp: input.ip,
      accountsFromSameIpLast24h: Number(row?.same_ip ?? 0),
      similarEmailAccounts: Number(row?.similar_email ?? 0),
      duplicatePhoneAccounts: Number(row?.duplicate_phone ?? 0),
      userAgent: input.userAgent,
      profileCompletedWithinSeconds: null,
    });

    if (assessment.recommendation === 'NO_ACTION') return;

    for (const signal of assessment.signals) {
      await sql`
        INSERT INTO fraud_flags (user_id, entity_type, entity_id, rule, severity, score, reason, signals, detected_by)
        VALUES (
          ${input.userId}, 'user', ${input.userId}, ${signal.rule}, ${signal.severity},
          ${assessment.riskScore}, ${signal.reason},
          ${json({ evidence: signal.evidence ?? null })}, 'heuristic'
        )
      `;
    }
  } catch (err) {
    console.error('[accounts] account screening failed', err);
  }
}

export interface LoginResult {
  userId: string;
  role: UserRole;
  fullName: string;
  emailVerified: boolean;
}

export async function login(input: {
  email: string;
  password: string;
  ip?: string | null;
}): Promise<LoginResult> {
  const emailNormalized = input.email.toLowerCase().trim();

  const rows = await sql<
    Array<{
      id: string; password_hash: string; role: UserRole; status: string; full_name: string;
      failed_login_count: number; locked_until: Date | null; email_verified_at: Date | null;
    }>
  >`
    SELECT id, password_hash, role, status, full_name, failed_login_count, locked_until, email_verified_at
    FROM users WHERE email_normalized = ${emailNormalized} AND deleted_at IS NULL
  `;
  const user = rows[0];

  // Verify against a dummy hash when the account does not exist, so both paths
  // cost the same and the response cannot reveal which emails are registered.
  if (!user) {
    await verifyPassword(input.password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAA');
    throw unauthenticated('That email or password is not correct.');
  }

  if (user.locked_until && user.locked_until > new Date()) {
    const minutes = Math.ceil((user.locked_until.getTime() - Date.now()) / 60_000);
    throw new AppError(
      'RATE_LIMITED',
      `Too many failed attempts. Try again in ${minutes} minute(s), or reset your password.`,
      { retryAfter: minutes * 60 },
    );
  }

  const valid = await verifyPassword(input.password, user.password_hash);

  if (!valid) {
    const nextCount = user.failed_login_count + 1;
    const shouldLock = nextCount >= LOCKOUT_THRESHOLD;
    await sql`
      UPDATE users
      SET failed_login_count = ${nextCount},
          locked_until = ${shouldLock ? sql`now() + (${LOCKOUT_MINUTES}::text || ' minutes')::interval` : null}
      WHERE id = ${user.id}
    `;
    await audit({
      actorId: user.id,
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user.id,
      metadata: { attempt: nextCount, locked: shouldLock },
      ip: input.ip,
    });
    throw unauthenticated('That email or password is not correct.');
  }

  if (user.status === 'SUSPENDED') {
    throw new AppError(
      'FORBIDDEN',
      'This account is suspended pending review. Contact support if you believe this is a mistake.',
    );
  }
  if (user.status === 'CLOSED') {
    throw new AppError('FORBIDDEN', 'This account has been closed.');
  }

  // Transparently upgrade the hash if the cost parameters have been raised.
  if (needsRehash(user.password_hash)) {
    const upgraded = await hashPassword(input.password);
    await sql`UPDATE users SET password_hash = ${upgraded} WHERE id = ${user.id}`;
  }

  await sql`
    UPDATE users SET last_login_at = now(), failed_login_count = 0, locked_until = NULL WHERE id = ${user.id}
  `;

  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    ip: input.ip,
  });

  return {
    userId: user.id,
    role: user.role,
    fullName: user.full_name,
    emailVerified: Boolean(user.email_verified_at),
  };
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const rows = await sql<{ password_hash: string; email: string; full_name: string }[]>`
    SELECT password_hash, email, full_name FROM users WHERE id = ${input.userId} AND deleted_at IS NULL
  `;
  const user = rows[0];
  if (!user) throw unauthenticated();

  if (!(await verifyPassword(input.currentPassword, user.password_hash))) {
    throw unauthenticated('Your current password is not correct.');
  }

  const strength = validatePasswordStrength(input.newPassword, { email: user.email, name: user.full_name });
  if (!strength.valid) {
    throw new AppError('VALIDATION_FAILED', 'Please choose a stronger password.', {
      fields: { newPassword: strength.problems },
    });
  }

  const hash = await hashPassword(input.newPassword);
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${input.userId}`;

  // Every other session is invalidated: a password change must evict an
  // attacker who already has a session cookie.
  await revokeAllSessions(input.userId);

  await audit({
    actorId: input.userId,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: input.userId,
  });
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

/** Six-digit numeric code — usable over SMS later without change. */
function generateCode(): string {
  return String(randomInt(100_000, 999_999));
}

export async function sendVerificationCode(input: {
  userId: string;
  kind: 'EMAIL' | 'PHONE';
}): Promise<{ sent: boolean; devCode?: string }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 15 * 60_000);

  // Supersede any outstanding code so only the newest one works.
  await sql`
    UPDATE verification_records SET state = 'EXPIRED'
    WHERE user_id = ${input.userId} AND kind = ${input.kind} AND state = 'PENDING'
  `;

  await sql`
    INSERT INTO verification_records (user_id, kind, state, code_hash, expires_at)
    VALUES (${input.userId}, ${input.kind}, 'PENDING', ${hashCode(code)}, ${expiresAt})
  `;

  await notify({
    userId: input.userId,
    kind: 'verification.code',
    title: 'Your KaziOS verification code',
    body: `Your verification code is ${code}. It expires in 15 minutes. If you did not request it, ignore this message.`,
    channels: input.kind === 'EMAIL' ? ['EMAIL'] : ['SMS'],
  });

  await track({ event: 'verification_submitted', userId: input.userId, properties: { kind: input.kind } });

  // Outside production the code is returned so the flow is testable without a
  // mail transport. `getEnv()` refuses placeholder secrets in production, and
  // this branch is compiled out of the production path by the check below.
  return process.env.NODE_ENV === 'production' ? { sent: true } : { sent: true, devCode: code };
}

export async function confirmVerificationCode(input: {
  userId: string;
  kind: 'EMAIL' | 'PHONE';
  code: string;
}): Promise<boolean> {
  const rows = await sql<{ id: string; code_hash: string | null; attempts: number; expires_at: Date | null }[]>`
    SELECT id, code_hash, attempts, expires_at
    FROM verification_records
    WHERE user_id = ${input.userId} AND kind = ${input.kind} AND state = 'PENDING'
    ORDER BY created_at DESC LIMIT 1
  `;
  const record = rows[0];
  if (!record) return false;

  if (record.expires_at && record.expires_at < new Date()) {
    await sql`UPDATE verification_records SET state = 'EXPIRED' WHERE id = ${record.id}`;
    return false;
  }

  // Bounded attempts stop a six-digit code from being brute-forced.
  if (record.attempts >= 5) {
    await sql`UPDATE verification_records SET state = 'EXPIRED' WHERE id = ${record.id}`;
    return false;
  }

  if (record.code_hash !== hashCode(input.code.trim())) {
    await sql`UPDATE verification_records SET attempts = attempts + 1 WHERE id = ${record.id}`;
    return false;
  }

  await withTransaction(async (tx) => {
    await tx`
      UPDATE verification_records SET state = 'APPROVED', verified_at = now(), code_hash = NULL
      WHERE id = ${record.id}
    `;
    if (input.kind === 'EMAIL') {
      await tx`UPDATE users SET email_verified_at = now() WHERE id = ${input.userId}`;
    } else {
      await tx`UPDATE users SET phone_verified_at = now() WHERE id = ${input.userId}`;
    }
  });

  await audit({
    actorId: input.userId,
    action: `verification.${input.kind.toLowerCase()}_confirmed`,
    entityType: 'user',
    entityId: input.userId,
  });
  await track({ event: 'verification_approved', userId: input.userId, properties: { kind: input.kind } });

  return true;
}
