import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { EmptyState, PageHeader } from '@/components/ui';
import { DisputeQueue } from './queue';

export const metadata: Metadata = { title: 'Disputes' };
export const dynamic = 'force-dynamic';

export default async function AdminDisputesPage() {
  await requireAuth(['ADMIN']);

  const disputes = await sql<
    Array<{
      id: string; reference: string; reason: string; details: string; status: string; created_at: Date;
      task_title: string | null; raised_by_name: string; against_name: string;
      gross_amount: string | null; submission_summary: string | null; reviewer_notes: string | null;
    }>
  >`
    SELECT d.id, d.reference, d.reason, d.details, d.status::text, d.created_at,
           t.title AS task_title, ru.full_name AS raised_by_name, au.full_name AS against_name,
           p.gross_amount,
           (SELECT ws.summary FROM work_submissions ws
             WHERE ws.assignment_id = d.assignment_id ORDER BY ws.attempt_number DESC LIMIT 1) AS submission_summary,
           (SELECT ws.reviewer_notes FROM work_submissions ws
             WHERE ws.assignment_id = d.assignment_id ORDER BY ws.attempt_number DESC LIMIT 1) AS reviewer_notes
    FROM disputes d
    JOIN users ru ON ru.id = d.raised_by
    JOIN users au ON au.id = d.against_user_id
    LEFT JOIN tasks t ON t.id = d.task_id
    LEFT JOIN payments p ON p.id = d.payment_id
    WHERE d.status IN ('OPEN', 'UNDER_REVIEW')
    ORDER BY d.created_at ASC
  `;

  return (
    <>
      <PageHeader
        title="Disputes"
        description="Money is held until each of these is decided. Both parties are waiting on you, and your decision is recorded with your name on it."
      />

      {disputes.length === 0 ? (
        <EmptyState icon="scales" title="No open disputes." description="Nothing needs deciding right now." />
      ) : (
        <DisputeQueue
          disputes={disputes.map((dispute) => ({
            id: dispute.id,
            reference: dispute.reference,
            reason: dispute.reason,
            details: dispute.details,
            status: dispute.status,
            createdAt: dispute.created_at.toISOString(),
            taskTitle: dispute.task_title,
            raisedBy: dispute.raised_by_name,
            against: dispute.against_name,
            amountInEscrow: dispute.gross_amount ? Number(dispute.gross_amount) : null,
            submissionSummary: dispute.submission_summary,
            reviewerNotes: dispute.reviewer_notes,
          }))}
        />
      )}
    </>
  );
}
