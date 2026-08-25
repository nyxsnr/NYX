import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { getAssignment, listSubmissions } from '@/lib/domain/applications';
import { getEnv } from '@/lib/config/env';
import { formatKes } from '@/lib/i18n';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { SubmitWorkPanel } from './submit-panel';

export const metadata: Metadata = { title: 'Your work' };
export const dynamic = 'force-dynamic';

export default async function WorkerAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const assignment = await getAssignment(id);
  if (!assignment || assignment.worker_profile_id !== profile.id) notFound();

  const submissions = await listSubmissions(id);
  const agreed = Number(assignment.agreed_amount);
  const feeBps = getEnv().PLATFORM_FEE_BPS;
  const net = agreed - Math.round((agreed * feeBps) / 10_000);
  const escrowFunded = assignment.payment_status === 'HELD_IN_ESCROW' || assignment.payment_status === 'RELEASED';
  const latest = submissions[0];

  return (
    <>
      <PageHeader title={assignment.task_title} description={assignment.company_name} />

      {escrowFunded ? (
        <div className="mb-6">
          <Alert tone="success" title="Your payment is secured">
            {formatKes(agreed)} is held in escrow for this work. {formatKes(net)} reaches your balance
            when the employer approves your submission.
          </Alert>
        </div>
      ) : (
        <div className="mb-6">
          <Alert tone="warning" title="Payment not yet secured">
            Escrow has not been confirmed for this assignment. Contact the employer before starting
            work, and report it if they ask you to begin anyway.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold">The work</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{assignment.task_description}</p>

            <h3 className="mt-5 font-semibold">What you must deliver</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{assignment.expected_output}</p>

            {assignment.quality_requirements ? (
              <>
                <h3 className="mt-5 font-semibold">Quality requirements</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{assignment.quality_requirements}</p>
              </>
            ) : null}
          </Card>

          {submissions.length > 0 ? (
            <Card>
              <h2 className="text-lg font-semibold">Your submissions</h2>
              <ul className="mt-3 space-y-3">
                {submissions.map((submission) => (
                  <li key={submission.id} className="rounded-lg surface-sunken p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">Attempt {submission.attempt_number}</span>
                      <Badge
                        tone={
                          submission.status === 'APPROVED'
                            ? 'success'
                            : submission.status === 'REVISION_REQUESTED'
                              ? 'warning'
                              : 'info'
                        }
                      >
                        {submission.status.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm">{submission.summary}</p>
                    {submission.reviewer_notes ? (
                      <p className="mt-2 rounded-lg border-l-2 border-ochre-500 pl-3 text-sm text-secondary">
                        <span className="font-semibold">Employer feedback: </span>
                        {submission.reviewer_notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {assignment.status === 'ACTIVE' ? (
            <SubmitWorkPanel
              assignmentId={assignment.id}
              isRevision={latest?.status === 'REVISION_REQUESTED'}
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <p className="text-sm text-muted">You will receive</p>
            <p className="text-2xl font-bold tabular-nums">{formatKes(net)}</p>
            <p className="mt-1 text-sm text-secondary">from a {formatKes(agreed)} budget, after the platform fee.</p>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium">{assignment.status.toLowerCase()}</dd>
              </div>
              {assignment.due_at ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Due</dt>
                  <dd className="font-medium">{new Date(assignment.due_at).toLocaleDateString('en-KE')}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Started</dt>
                <dd className="font-medium">{new Date(assignment.started_at).toLocaleDateString('en-KE')}</dd>
              </div>
            </dl>
          </Card>

          {assignment.status === 'APPROVED' ? (
            <Alert tone="success" title="Approved and paid">
              This work has been approved and {formatKes(net)} was released to your balance.
            </Alert>
          ) : null}
        </div>
      </div>
    </>
  );
}
