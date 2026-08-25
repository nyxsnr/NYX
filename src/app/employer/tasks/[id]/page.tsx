import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { assertOwnsTask, requireEmployer } from '@/lib/domain/employers';
import { getTask } from '@/lib/domain/opportunities';
import { listTaskApplicants } from '@/lib/domain/applications';
import { sql } from '@/lib/db/client';
import { formatKes, timeAgo } from '@/lib/i18n';
import { Alert, Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { TaskApplicantList } from './applicant-list';

export const metadata: Metadata = { title: 'Task and proposals' };
export const dynamic = 'force-dynamic';

export default async function EmployerTaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth(['EMPLOYER']);
  const employer = await requireEmployer(auth.user.id);
  await assertOwnsTask(employer.companyId, id);

  const task = await getTask(id);
  if (!task) notFound();

  const [applicants, assignments] = await Promise.all([
    listTaskApplicants(id),
    sql<Array<{ id: string; status: string; worker_name: string; agreed_amount: string; submission_status: string | null }>>`
      SELECT a.id, a.status, u.full_name AS worker_name, a.agreed_amount, ws.status::text AS submission_status
      FROM task_assignments a
      JOIN worker_profiles wp ON wp.id = a.worker_profile_id
      JOIN users u ON u.id = wp.user_id
      LEFT JOIN LATERAL (
        SELECT status FROM work_submissions WHERE assignment_id = a.id ORDER BY attempt_number DESC LIMIT 1
      ) ws ON true
      WHERE a.task_id = ${id}
      ORDER BY a.started_at DESC
    `,
  ]);

  const openSlots = task.workers_needed - task.workers_assigned;

  return (
    <>
      <PageHeader
        title={task.title}
        description={`${task.category} · ${formatKes(Number(task.budget_amount))} · ${task.status.replace(/_/g, ' ').toLowerCase()}`}
      />

      {task.status === 'PENDING_REVIEW' ? (
        <div className="mb-6">
          <Alert tone="warning" title="Held for review">
            {task.moderation_notes ?? 'This task is being checked before it goes live.'}
          </Alert>
        </div>
      ) : null}

      {assignments.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Assigned workers</h2>
          <ul className="space-y-2">
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <Link href={`/employer/work/${assignment.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:surface-sunken">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{assignment.worker_name}</p>
                    <p className="text-sm text-muted">
                      {formatKes(Number(assignment.agreed_amount))} · {assignment.status.toLowerCase()}
                    </p>
                  </div>
                  {assignment.submission_status === 'SUBMITTED' ? (
                    <span className="btn btn-primary shrink-0 px-4 text-sm">Review work</span>
                  ) : (
                    <Badge tone={assignment.status === 'APPROVED' ? 'success' : 'info'}>
                      {assignment.submission_status?.replace(/_/g, ' ').toLowerCase() ?? assignment.status.toLowerCase()}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="mb-3 text-lg font-semibold">
        Proposals ({applicants.filter((a) => a.status === 'SUBMITTED').length} awaiting decision)
      </h2>

      {applicants.length === 0 ? (
        <EmptyState
          icon="⚡"
          title="No proposals yet."
          description={
            task.status === 'PUBLISHED'
              ? 'Workers whose evidence matches this task will see it in their matched tasks. You can also search talent directly.'
              : 'This task is not published, so workers cannot see it.'
          }
          actionLabel={task.status === 'PUBLISHED' ? 'Search talent' : undefined}
          actionHref={task.status === 'PUBLISHED' ? '/employer/talent' : undefined}
        />
      ) : (
        <TaskApplicantList
          openSlots={openSlots}
          budget={Number(task.budget_amount)}
          applicants={applicants.map((a) => ({
            applicationId: a.id,
            status: a.status,
            appliedAt: a.created_at.toISOString(),
            matchScore: a.match_score,
            matchExplanation: a.match_explanation as { reasons?: Array<{ factor: string; impact: string; explanation: string }>; gaps?: string[] } | null,
            proposal: a.proposal,
            proposalAiAssisted: a.ai_assisted,
            bidAmount: a.bid_amount ? Number(a.bid_amount) : null,
            estimatedDays: a.estimated_days,
            worker: {
              name: a.full_name,
              headline: a.headline,
              readinessScore: a.readiness_score,
              verifiedSkillCount: a.verified_skill_count,
              rating: a.rating_count >= 3 && a.avg_rating ? Number(a.avg_rating) : null,
              ratingCount: a.rating_count,
              tasksCompleted: a.tasks_completed,
              completionRate: a.completion_rate ? Number(a.completion_rate) : null,
            },
          }))}
        />
      )}

      <Card className="mt-8">
        <h2 className="font-semibold">The brief</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{task.description}</p>
        <h3 className="mt-4 font-semibold">Expected output</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{task.expected_output}</p>
        <p className="mt-4 text-xs text-muted">Posted {task.published_at ? timeAgo(task.published_at) : 'not yet published'}.</p>
      </Card>
    </>
  );
}
