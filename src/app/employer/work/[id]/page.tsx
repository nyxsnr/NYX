import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireEmployer } from '@/lib/domain/employers';
import { getAssignment, listSubmissions } from '@/lib/domain/applications';
import { formatKes, timeAgo } from '@/lib/i18n';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { ReviewPanel } from './review-panel';

export const metadata: Metadata = { title: 'Review work' };
export const dynamic = 'force-dynamic';

export default async function EmployerWorkReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth(['EMPLOYER']);
  await requireEmployer(auth.user.id);

  const assignment = await getAssignment(id);
  if (!assignment || assignment.posted_by !== auth.user.id) notFound();

  const submissions = await listSubmissions(id);
  const latest = submissions[0];
  const agreed = Number(assignment.agreed_amount);

  return (
    <>
      <PageHeader title={assignment.task_title} description={`${assignment.worker_name} · ${formatKes(agreed)}`} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold">What was asked for</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{assignment.expected_output}</p>
            {assignment.quality_requirements ? (
              <>
                <h3 className="mt-4 font-semibold">Quality requirements</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{assignment.quality_requirements}</p>
              </>
            ) : null}
          </Card>

          {submissions.length === 0 ? (
            <Card>
              <p className="text-sm text-secondary">
                Nothing submitted yet. {assignment.worker_name} is working on this.
              </p>
            </Card>
          ) : (
            submissions.map((submission) => (
              <Card key={submission.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Attempt {submission.attempt_number}</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted">{timeAgo(submission.submitted_at)}</span>
                    <Badge
                      tone={
                        submission.status === 'APPROVED' ? 'success' : submission.status === 'REVISION_REQUESTED' ? 'warning' : 'info'
                      }
                    >
                      {submission.status.replace(/_/g, ' ').toLowerCase()}
                    </Badge>
                  </div>
                </div>

                <h3 className="mt-3 text-sm font-semibold">Their summary</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{submission.summary}</p>

                {submission.content ? (
                  <>
                    <h3 className="mt-4 text-sm font-semibold">The work</h3>
                    <div className="mt-1 max-h-96 overflow-y-auto rounded-lg surface-sunken p-3">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{submission.content}</p>
                    </div>
                  </>
                ) : null}

                {submission.external_links.length > 0 ? (
                  <>
                    <h3 className="mt-4 text-sm font-semibold">Links</h3>
                    <ul className="mt-1 space-y-1">
                      {submission.external_links.map((link) => (
                        <li key={link}>
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="break-all text-sm font-medium text-jade-600 hover:underline dark:text-jade-300"
                          >
                            {link}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {submission.reviewer_notes ? (
                  <p className="mt-4 rounded-lg border-l-2 border-ochre-500 pl-3 text-sm text-secondary">
                    <span className="font-semibold">Your feedback: </span>
                    {submission.reviewer_notes}
                  </p>
                ) : null}
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {latest && latest.status === 'SUBMITTED' ? (
            <ReviewPanel submissionId={latest.id} amount={agreed} workerName={assignment.worker_name} />
          ) : latest?.status === 'APPROVED' ? (
            <Alert tone="success" title="Approved and paid">
              You approved this work and payment was released to {assignment.worker_name}.
            </Alert>
          ) : latest?.status === 'REVISION_REQUESTED' ? (
            <Alert tone="warning" title="Revision requested">
              Waiting for {assignment.worker_name} to resubmit.
            </Alert>
          ) : (
            <Card>
              <p className="text-sm text-secondary">Nothing to review yet.</p>
            </Card>
          )}

          <Card>
            <h2 className="font-semibold">Escrow</h2>
            <p className="mt-2 text-2xl font-bold tabular-nums">{formatKes(agreed)}</p>
            <p className="mt-1 text-sm text-secondary">
              {assignment.payment_status === 'RELEASED'
                ? 'Released to the worker.'
                : 'Held. Released the moment you approve.'}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
