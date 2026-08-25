/**
 * Role-based access control.
 *
 * Permissions are named capabilities, not roles, so route handlers ask "may
 * this actor do X?" rather than "is this actor an admin?". Ownership checks
 * live alongside them because most authorization in this product is
 * "admin, or the person this record belongs to".
 */
export type UserRole = 'WORKER' | 'EMPLOYER' | 'ADMIN';

export type Permission =
  // Worker
  | 'worker:profile:write'
  | 'worker:apply'
  | 'worker:simulation:attempt'
  | 'worker:portfolio:write'
  | 'worker:wallet:read'
  | 'worker:payout:request'
  // Employer
  | 'employer:job:write'
  | 'employer:task:write'
  | 'employer:application:decide'
  | 'employer:submission:review'
  | 'employer:payment:fund'
  | 'employer:payment:release'
  | 'employer:talent:search'
  | 'employer:company:write'
  // Shared
  | 'review:write'
  | 'dispute:open'
  | 'message:send'
  | 'ai:use'
  // Admin
  | 'admin:user:read'
  | 'admin:user:moderate'
  | 'admin:content:moderate'
  | 'admin:verification:decide'
  | 'admin:dispute:resolve'
  | 'admin:fraud:review'
  | 'admin:payment:override'
  | 'admin:analytics:read';

const WORKER_PERMISSIONS: Permission[] = [
  'worker:profile:write',
  'worker:apply',
  'worker:simulation:attempt',
  'worker:portfolio:write',
  'worker:wallet:read',
  'worker:payout:request',
  'review:write',
  'dispute:open',
  'message:send',
  'ai:use',
];

const EMPLOYER_PERMISSIONS: Permission[] = [
  'employer:job:write',
  'employer:task:write',
  'employer:application:decide',
  'employer:submission:review',
  'employer:payment:fund',
  'employer:payment:release',
  'employer:talent:search',
  'employer:company:write',
  'review:write',
  'dispute:open',
  'message:send',
  'ai:use',
];

// Admins are granted every permission explicitly rather than by a wildcard, so
// that adding a new permission is a deliberate decision about who gets it.
const ADMIN_PERMISSIONS: Permission[] = [
  ...WORKER_PERMISSIONS.filter((p) => !p.startsWith('worker:')),
  'admin:user:read',
  'admin:user:moderate',
  'admin:content:moderate',
  'admin:verification:decide',
  'admin:dispute:resolve',
  'admin:fraud:review',
  'admin:payment:override',
  'admin:analytics:read',
  'employer:talent:search',
];

const PERMISSIONS_BY_ROLE: Record<UserRole, ReadonlySet<Permission>> = {
  WORKER: new Set(WORKER_PERMISSIONS),
  EMPLOYER: new Set(EMPLOYER_PERMISSIONS),
  ADMIN: new Set(ADMIN_PERMISSIONS),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return PERMISSIONS_BY_ROLE[role].has(permission);
}

export function permissionsFor(role: UserRole): Permission[] {
  return [...PERMISSIONS_BY_ROLE[role]].sort();
}

/**
 * Admins may act on anyone's records; everyone else only on their own.
 * Used for the "read my application" / "read this application" split.
 */
export function canAccessOwned(
  actor: { id: string; role: UserRole },
  ownerId: string | null | undefined,
): boolean {
  if (actor.role === 'ADMIN') return true;
  return Boolean(ownerId) && actor.id === ownerId;
}

/** Route-prefix guard used by the middleware and layout guards. */
export function rolesForPathPrefix(pathname: string): UserRole[] | null {
  if (pathname.startsWith('/worker')) return ['WORKER'];
  if (pathname.startsWith('/employer')) return ['EMPLOYER'];
  if (pathname.startsWith('/admin')) return ['ADMIN'];
  return null;
}

/** Where each role lands after signing in. */
export function homePathFor(role: UserRole): string {
  switch (role) {
    case 'WORKER':
      return '/worker';
    case 'EMPLOYER':
      return '/employer';
    case 'ADMIN':
      return '/admin';
  }
}
