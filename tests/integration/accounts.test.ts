import { describe, expect, it } from 'vitest';
import { createUser, hasDatabase, testDb, useCleanDatabase, TEST_PASSWORD } from './helpers';
import { changePassword, confirmVerificationCode, login, sendVerificationCode, signup } from '@/lib/domain/accounts';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { needsRehash, verifyPassword } from '@/lib/auth/password';

describe.skipIf(!hasDatabase)('signup', () => {
  useCleanDatabase();

  it('creates a worker with a profile and a wallet-ready account', async () => {
    const sql = testDb();
    const result = await signup({
      email: 'New.Worker@Example.com',
      password: 'a good long passphrase',
      fullName: 'New Worker',
      role: 'WORKER',
      phone: '+254712345678',
    });

    expect(result.role).toBe('WORKER');

    const users = await sql<{ email_normalized: string; role: string }[]>`
      SELECT email_normalized, role::text FROM users WHERE id = ${result.userId}
    `;
    // Email is normalised at the edge, so lookups are always case-insensitive.
    expect(users[0]?.email_normalized).toBe('new.worker@example.com');

    const profiles = await sql`SELECT id FROM worker_profiles WHERE user_id = ${result.userId}`;
    expect(profiles).toHaveLength(1);
  });

  it('creates an employer with a company and an employer profile', async () => {
    const sql = testDb();
    const result = await signup({
      email: 'boss@example.com',
      password: 'another good passphrase',
      fullName: 'The Boss',
      role: 'EMPLOYER',
      companyName: 'Boss Enterprises',
    });

    const rows = await sql<{ name: string }[]>`
      SELECT c.name FROM companies c
      JOIN employer_profiles ep ON ep.company_id = c.id
      WHERE ep.user_id = ${result.userId}
    `;
    expect(rows[0]?.name).toBe('Boss Enterprises');
  });

  it('refuses a duplicate email regardless of case', async () => {
    await signup({ email: 'taken@example.com', password: 'a good long passphrase', fullName: 'First', role: 'WORKER' });

    await expect(
      signup({ email: 'TAKEN@example.com', password: 'a good long passphrase', fullName: 'Second', role: 'WORKER' }),
    ).rejects.toThrow(/already exists/i);
  });

  it('refuses a duplicate phone number', async () => {
    await signup({
      email: 'phone1@example.com', password: 'a good long passphrase',
      fullName: 'First', role: 'WORKER', phone: '+254712999888',
    });

    await expect(
      signup({
        email: 'phone2@example.com', password: 'a good long passphrase',
        fullName: 'Second', role: 'WORKER', phone: '+254712999888',
      }),
    ).rejects.toThrow(/already registered/i);
  });

  it('refuses a weak password before any account is created', async () => {
    const sql = testDb();
    await expect(
      signup({ email: 'weak@example.com', password: 'password123', fullName: 'Weak', role: 'WORKER' }),
    ).rejects.toThrow(/stronger password/i);

    const users = await sql`SELECT id FROM users WHERE email_normalized = 'weak@example.com'`;
    expect(users).toHaveLength(0);
  });
});

describe.skipIf(!hasDatabase)('login', () => {
  useCleanDatabase();

  it('signs in with the correct password', async () => {
    await createUser({ email: 'signin@example.com', role: 'WORKER', fullName: 'Sign In' });
    const result = await login({ email: 'signin@example.com', password: TEST_PASSWORD });
    expect(result.role).toBe('WORKER');
    expect(result.fullName).toBe('Sign In');
  });

  it('gives the same error for a wrong password and an unknown account', async () => {
    await createUser({ email: 'known@example.com', role: 'WORKER' });

    const wrongPassword = await login({ email: 'known@example.com', password: 'not the password' }).catch((e: Error) => e.message);
    const unknownUser = await login({ email: 'nobody@example.com', password: 'not the password' }).catch((e: Error) => e.message);

    // Identical wording: the endpoint must not reveal which emails exist.
    expect(wrongPassword).toBe(unknownUser);
  });

  it('locks the account after repeated failures, then reports the wait', async () => {
    await createUser({ email: 'lockme@example.com', role: 'WORKER' });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await login({ email: 'lockme@example.com', password: 'wrong' }).catch(() => undefined);
    }

    // Even the correct password is refused while the lock holds.
    await expect(login({ email: 'lockme@example.com', password: TEST_PASSWORD })).rejects.toThrow(/too many failed/i);
  });

  it('clears the failure count on a successful sign-in', async () => {
    const sql = testDb();
    await createUser({ email: 'recover@example.com', role: 'WORKER' });

    await login({ email: 'recover@example.com', password: 'wrong' }).catch(() => undefined);
    await login({ email: 'recover@example.com', password: TEST_PASSWORD });

    const rows = await sql<{ failed_login_count: number; locked_until: Date | null }[]>`
      SELECT failed_login_count, locked_until FROM users WHERE email_normalized = 'recover@example.com'
    `;
    expect(rows[0]?.failed_login_count).toBe(0);
    expect(rows[0]?.locked_until).toBeNull();
  });

  it('refuses a suspended account with a distinct message', async () => {
    const sql = testDb();
    await createUser({ email: 'suspended@example.com', role: 'WORKER' });
    await sql`UPDATE users SET status = 'SUSPENDED' WHERE email_normalized = 'suspended@example.com'`;

    await expect(login({ email: 'suspended@example.com', password: TEST_PASSWORD })).rejects.toThrow(/suspended/i);
  });

  it('transparently upgrades a hash created under weaker parameters', async () => {
    const sql = testDb();
    const userId = await createUser({ email: 'oldhash@example.com', role: 'WORKER' });

    // A genuinely valid hash from an older, cheaper policy (N=4096).
    const scryptAsync = promisify(scrypt) as (
      password: string,
      salt: Buffer,
      keylen: number,
      options: { N: number; r: number; p: number; maxmem: number },
    ) => Promise<Buffer>;

    const salt = randomBytes(16);
    const derived = await scryptAsync(TEST_PASSWORD, salt, 64, {
      N: 4096, r: 8, p: 1, maxmem: 256 * 4096 * 8,
    });
    const legacyHash = `scrypt$4096$8$1$${salt.toString('base64')}$${derived.toString('base64')}`;

    await sql`UPDATE users SET password_hash = ${legacyHash} WHERE id = ${userId}`;
    expect(needsRehash(legacyHash)).toBe(true);

    // Signing in must still work, and must silently re-hash at current cost.
    await login({ email: 'oldhash@example.com', password: TEST_PASSWORD });

    const rows = await sql<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE id = ${userId}`;
    const upgraded = rows[0]?.password_hash as string;
    expect(upgraded.startsWith('scrypt$16384$')).toBe(true);
    expect(needsRehash(upgraded)).toBe(false);
    expect(await verifyPassword(TEST_PASSWORD, upgraded)).toBe(true);
  });
});

describe.skipIf(!hasDatabase)('password change', () => {
  useCleanDatabase();

  it('changes the password and revokes every existing session', async () => {
    const sql = testDb();
    const userId = await createUser({ email: 'changer@example.com', role: 'WORKER' });

    await sql`
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES (${userId}, 'hash-one', now() + interval '30 days'),
             (${userId}, 'hash-two', now() + interval '30 days')
    `;

    await changePassword({
      userId,
      currentPassword: TEST_PASSWORD,
      newPassword: 'a completely different passphrase',
    });

    const live = await sql`SELECT id FROM sessions WHERE user_id = ${userId} AND revoked_at IS NULL`;
    expect(live).toHaveLength(0);

    await login({ email: 'changer@example.com', password: 'a completely different passphrase' });
  });

  it('refuses when the current password is wrong', async () => {
    const userId = await createUser({ email: 'nochange@example.com', role: 'WORKER' });
    await expect(
      changePassword({ userId, currentPassword: 'wrong', newPassword: 'a valid new passphrase' }),
    ).rejects.toThrow(/not correct/i);
  });
});

describe.skipIf(!hasDatabase)('verification', () => {
  useCleanDatabase();

  it('verifies an email with the issued code', async () => {
    const sql = testDb();
    const userId = await createUser({ email: 'verify@example.com', role: 'WORKER', verified: false });

    const sent = await sendVerificationCode({ userId, kind: 'EMAIL' });
    expect(sent.devCode).toMatch(/^\d{6}$/);

    const ok = await confirmVerificationCode({ userId, kind: 'EMAIL', code: sent.devCode as string });
    expect(ok).toBe(true);

    const rows = await sql<{ email_verified_at: Date | null }[]>`
      SELECT email_verified_at FROM users WHERE id = ${userId}
    `;
    expect(rows[0]?.email_verified_at).not.toBeNull();
  });

  it('rejects a wrong code and stops accepting after five attempts', async () => {
    const userId = await createUser({ email: 'bruteforce@example.com', role: 'WORKER', verified: false });
    const sent = await sendVerificationCode({ userId, kind: 'EMAIL' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await confirmVerificationCode({ userId, kind: 'EMAIL', code: '000000' })).toBe(false);
    }

    // The correct code no longer works: the record is burned.
    expect(await confirmVerificationCode({ userId, kind: 'EMAIL', code: sent.devCode as string })).toBe(false);
  });

  it('supersedes an older code when a new one is issued', async () => {
    const userId = await createUser({ email: 'resend@example.com', role: 'WORKER', verified: false });
    const first = await sendVerificationCode({ userId, kind: 'EMAIL' });
    const second = await sendVerificationCode({ userId, kind: 'EMAIL' });

    expect(await confirmVerificationCode({ userId, kind: 'EMAIL', code: first.devCode as string })).toBe(false);
    expect(await confirmVerificationCode({ userId, kind: 'EMAIL', code: second.devCode as string })).toBe(true);
  });
});
