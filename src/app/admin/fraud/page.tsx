import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { Alert, EmptyState, PageHeader } from '@/components/ui';
import { FraudQueue } from './queue';

export const metadata: Metadata = { title: 'Fraud signals' };
export const dynamic = 'force-dynamic';

export default async function AdminFraudPage() {
  await requireAuth(['ADMIN']);

  const flags = await sql<
    Array<{
      id: string; rule: string; severity: string; score: number | null; reason: string; signals: unknown;
      entity_type: string; entity_id: string | null; detected_by: string; created_at: Date;
      user_name: string | null; user_email: string | null; user_id: string | null;
    }>
  >`
    SELECT f.id, f.rule, f.severity::text, f.score, f.reason, f.signals,
           f.entity_type, f.entity_id, f.detected_by, f.created_at,
           u.full_name AS user_name, u.email AS user_email, f.user_id
    FROM fraud_flags f
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.state = 'OPEN'
    ORDER BY
      CASE f.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
      f.created_at DESC
    LIMIT 100
  `;

  return (
    <>
      <PageHeader title="Fraud signals" description="Advisory signals for human review." />

      <div className="mb-6">
        <Alert tone="info" title="These are signals, not verdicts">
          No account has been restricted by any of these. Restricting an account is a separate,
          deliberate action on the user record, and it requires a written reason that the person is
          told. A false positive here can cut off someone&rsquo;s income, so treat confirmation as a
          finding, not a punishment.
        </Alert>
      </div>

      {flags.length === 0 ? (
        <EmptyState icon="warning" title="No open signals." description="Nothing has been flagged for review." />
      ) : (
        <FraudQueue
          flags={flags.map((flag) => ({
            id: flag.id,
            rule: flag.rule,
            severity: flag.severity,
            score: flag.score,
            reason: flag.reason,
            evidence: (flag.signals as { evidence?: string } | null)?.evidence ?? null,
            entityType: flag.entity_type,
            entityId: flag.entity_id,
            detectedBy: flag.detected_by,
            createdAt: flag.created_at.toISOString(),
            userName: flag.user_name,
            userEmail: flag.user_email,
            userId: flag.user_id,
          }))}
        />
      )}
    </>
  );
}
