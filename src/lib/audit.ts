/**
 * Audit log.
 *
 * Append-only record of privileged and money-moving actions: who did what, to
 * which entity, from where. Written for every admin action, every payment
 * state change, and every authentication event that matters.
 *
 * Audit writes must never break the operation being audited, so failures are
 * logged and swallowed. A missing audit row is a monitoring problem; a failed
 * payment release because the audit table was busy would be a much worse one.
 */
import 'server-only';
import { json, sql, type Db } from '@/lib/db/client';
import type { UserRole } from '@/lib/auth/rbac';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Keys whose values must never be written to the audit log. */
const REDACTED_KEYS = new Set([
  'password', 'passwordHash', 'token', 'sessionToken', 'csrfToken', 'code',
  'codeHash', 'apiKey', 'secret', 'pin', 'otp', 'authorization',
]);

function redact(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (REDACTED_KEYS.has(key)) {
      out[key] = '[redacted]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redact(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function audit(entry: AuditEntry, db: Db = sql): Promise<void> {
  try {
    await db`
      INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, metadata, ip_address)
      VALUES (
        ${entry.actorId ?? null}, ${entry.actorRole ?? null}, ${entry.action},
        ${entry.entityType}, ${entry.entityId ?? null},
        ${json(redact(entry.metadata ?? {}))},
        ${entry.ip ?? null}::inet
      )
    `;
  } catch (err) {
    console.error('[audit] write failed', entry.action, err);
  }
}

export interface AuditRecord {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: UserRole | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** Admin-facing audit trail query. */
export async function listAuditLog(options: {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: AuditRecord[]; total: number }> {
  const limit = Math.min(200, options.limit ?? 50);
  const offset = options.offset ?? 0;

  const rows = await sql<
    Array<{
      id: string; actor_id: string | null; actor_name: string | null; actor_role: UserRole | null;
      action: string; entity_type: string; entity_id: string | null;
      metadata: Record<string, unknown>; created_at: Date; total: string;
    }>
  >`
    SELECT a.id::text, a.actor_id, u.full_name AS actor_name, a.actor_role,
           a.action, a.entity_type, a.entity_id, a.metadata, a.created_at,
           count(*) OVER ()::text AS total
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE (${options.entityType ?? null}::text IS NULL OR a.entity_type = ${options.entityType ?? null})
      AND (${options.entityId ?? null}::text IS NULL OR a.entity_id = ${options.entityId ?? null})
      AND (${options.actorId ?? null}::uuid IS NULL OR a.actor_id = ${options.actorId ?? null}::uuid)
      AND (${options.action ?? null}::text IS NULL OR a.action = ${options.action ?? null})
    ORDER BY a.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return {
    items: rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      metadata: r.metadata,
      createdAt: r.created_at,
    })),
    total: Number(rows[0]?.total ?? 0),
  };
}
