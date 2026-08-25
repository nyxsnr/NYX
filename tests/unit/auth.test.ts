import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, validatePasswordStrength, verifyPassword } from '@/lib/auth/password';
import { canAccessOwned, hasPermission, homePathFor, permissionsFor, rolesForPathPrefix } from '@/lib/auth/rbac';

describe('password hashing', () => {
  it('produces a verifiable hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password entirely', hash)).toBe(false);
  });

  it('salts: the same password hashes differently every time', async () => {
    const a = await hashPassword('the same password here');
    const b = await hashPassword('the same password here');
    expect(a).not.toBe(b);
    expect(await verifyPassword('the same password here', a)).toBe(true);
    expect(await verifyPassword('the same password here', b)).toBe(true);
  });

  it('encodes its parameters so they can be raised later', async () => {
    const hash = await hashPassword('a sufficiently long password');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(hash.split('$')).toHaveLength(6);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    for (const bad of ['', 'garbage', 'scrypt$x$y$z$a$b', 'bcrypt$1$2$3$4$5', 'scrypt$16384$8$1$only-five']) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });

  it('refuses absurd parameters from a tampered row', async () => {
    expect(await verifyPassword('x', 'scrypt$99999999$8$1$c2FsdA==$aGFzaA==')).toBe(false);
  });

  it('flags weaker stored parameters for rehash', async () => {
    expect(needsRehash(await hashPassword('a good long password here'))).toBe(false);
    expect(needsRehash('scrypt$1024$8$1$c2FsdA==$aGFzaA==')).toBe(true);
    expect(needsRehash('not-a-hash')).toBe(true);
  });
});

describe('password strength', () => {
  it('accepts a reasonable passphrase', () => {
    expect(validatePasswordStrength('mango tractor sunrise').valid).toBe(true);
  });

  it('rejects short passwords', () => {
    const result = validatePasswordStrength('short1');
    expect(result.valid).toBe(false);
    expect(result.problems.join(' ')).toContain('at least');
  });

  it('rejects passwords containing the user email or name', () => {
    expect(validatePasswordStrength('gracewanjiru2025', { email: 'gracewanjiru@example.com' }).valid).toBe(false);
    expect(validatePasswordStrength('wanjiru-is-here', { name: 'Grace Wanjiru' }).valid).toBe(false);
  });

  it('rejects locally-common guesses', () => {
    for (const weak of ['password123', 'nairobi2025', 'kazios12345']) {
      expect(validatePasswordStrength(weak).valid).toBe(false);
    }
  });
});

describe('role-based access control', () => {
  it('gives each role only its own capabilities', () => {
    expect(hasPermission('WORKER', 'worker:apply')).toBe(true);
    expect(hasPermission('WORKER', 'employer:job:write')).toBe(false);
    expect(hasPermission('WORKER', 'admin:user:moderate')).toBe(false);

    expect(hasPermission('EMPLOYER', 'employer:job:write')).toBe(true);
    expect(hasPermission('EMPLOYER', 'worker:apply')).toBe(false);
    expect(hasPermission('EMPLOYER', 'admin:dispute:resolve')).toBe(false);
  });

  it('grants admins moderation powers but not worker-identity actions', () => {
    expect(hasPermission('ADMIN', 'admin:dispute:resolve')).toBe(true);
    expect(hasPermission('ADMIN', 'admin:payment:override')).toBe(true);
    // An admin must not be able to apply for work as though they were a worker.
    expect(hasPermission('ADMIN', 'worker:apply')).toBe(false);
  });

  it('restricts ownership access to the owner or an admin', () => {
    const worker = { id: 'u1', role: 'WORKER' as const };
    const admin = { id: 'u2', role: 'ADMIN' as const };
    expect(canAccessOwned(worker, 'u1')).toBe(true);
    expect(canAccessOwned(worker, 'u9')).toBe(false);
    expect(canAccessOwned(worker, null)).toBe(false);
    expect(canAccessOwned(admin, 'u9')).toBe(true);
  });

  it('maps route prefixes to the roles allowed there', () => {
    expect(rolesForPathPrefix('/worker/jobs')).toEqual(['WORKER']);
    expect(rolesForPathPrefix('/employer/tasks')).toEqual(['EMPLOYER']);
    expect(rolesForPathPrefix('/admin/users')).toEqual(['ADMIN']);
    expect(rolesForPathPrefix('/jobs')).toBeNull();
  });

  it('sends each role to its own home', () => {
    expect(homePathFor('WORKER')).toBe('/worker');
    expect(homePathFor('EMPLOYER')).toBe('/employer');
    expect(homePathFor('ADMIN')).toBe('/admin');
  });

  it('never leaves a role without permissions', () => {
    for (const role of ['WORKER', 'EMPLOYER', 'ADMIN'] as const) {
      expect(permissionsFor(role).length).toBeGreaterThan(0);
    }
  });
});
