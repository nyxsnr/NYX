import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { EmptyState, PageHeader } from '@/components/ui';
import { ModerationQueue } from './queue';

export const metadata: Metadata = { title: 'Moderation queue' };
export const dynamic = 'force-dynamic';

interface Flag {
  rule: string;
  severity: string;
  reason: string;
}

export default async function ModerationPage() {
  await requireAuth(['ADMIN']);

  const [jobs, tasks] = await Promise.all([
    sql<Array<{ id: string; title: string; description: string; company_name: string; verification_tier: string; poster_email: string; created_at: Date; flags: Flag[] | null }>>`
      SELECT j.id, j.title, j.description, c.name AS company_name, c.verification_tier::text,
             u.email AS poster_email, j.created_at,
             (SELECT json_agg(json_build_object('rule', f.rule, 'severity', f.severity, 'reason', f.reason))
                FROM fraud_flags f WHERE f.entity_type = 'job' AND f.entity_id = j.id::text) AS flags
      FROM jobs j
      JOIN companies c ON c.id = j.company_id
      JOIN users u ON u.id = j.posted_by
      WHERE j.status = 'PENDING_REVIEW' AND j.deleted_at IS NULL
      ORDER BY j.created_at ASC
    `,
    sql<Array<{ id: string; title: string; description: string; company_name: string; verification_tier: string; poster_email: string; created_at: Date; flags: Flag[] | null }>>`
      SELECT t.id, t.title, t.description, c.name AS company_name, c.verification_tier::text,
             u.email AS poster_email, t.created_at,
             (SELECT json_agg(json_build_object('rule', f.rule, 'severity', f.severity, 'reason', f.reason))
                FROM fraud_flags f WHERE f.entity_type = 'task' AND f.entity_id = t.id::text) AS flags
      FROM tasks t
      JOIN companies c ON c.id = t.company_id
      JOIN users u ON u.id = t.posted_by
      WHERE t.status = 'PENDING_REVIEW' AND t.deleted_at IS NULL
      ORDER BY t.created_at ASC
    `,
  ]);

  const items = [
    ...jobs.map((job) => ({ ...job, entityType: 'job' as const })),
    ...tasks.map((task) => ({ ...task, entityType: 'task' as const })),
  ].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  return (
    <>
      <PageHeader
        title="Moderation queue"
        description="Postings held before publication. A worker on the other side of this is deciding whether to trust it."
      />

      {items.length === 0 ? (
        <EmptyState icon="shield" title="Queue is clear." description="Nothing is waiting for review right now." />
      ) : (
        <ModerationQueue
          items={items.map((item) => ({
            id: item.id,
            entityType: item.entityType,
            title: item.title,
            description: item.description,
            companyName: item.company_name,
            verificationTier: item.verification_tier,
            posterEmail: item.poster_email,
            createdAt: item.created_at.toISOString(),
            flags: item.flags ?? [],
          }))}
        />
      )}
    </>
  );
}
