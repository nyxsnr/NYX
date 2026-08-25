import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { assertOwnsJob, requireEmployer } from '@/lib/domain/employers';
import { getJob } from '@/lib/domain/opportunities';
import { listJobApplicants } from '@/lib/domain/applications';
import { Alert, Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { ApplicantList } from './applicant-list';

export const metadata: Metadata = { title: 'Job and applicants' };
export const dynamic = 'force-dynamic';

export default async function EmployerJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth(['EMPLOYER']);
  const employer = await requireEmployer(auth.user.id);
  await assertOwnsJob(employer.companyId, id);

  const job = await getJob(id);
  if (!job) notFound();

  const applicants = await listJobApplicants(id);

  return (
    <>
      <PageHeader
        title={job.title}
        description={`${job.region_name ?? 'Kenya'} · ${job.employment_type.replace(/_/g, ' ').toLowerCase()} · ${job.status.replace(/_/g, ' ').toLowerCase()}`}
      />

      {job.status === 'PENDING_REVIEW' ? (
        <div className="mb-6">
          <Alert tone="warning" title="Held for review">
            {job.moderation_notes ??
              'This posting is being checked before it goes live. We review anything that could put workers at risk.'}
          </Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Applicants', value: applicants.length },
          { label: 'Shortlisted', value: applicants.filter((a) => a.status === 'SHORTLISTED').length },
          { label: 'Views', value: job.view_count },
          { label: 'Openings', value: job.openings },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Applicants</h2>

      {applicants.length === 0 ? (
        <EmptyState
          icon="👤"
          title="No applicants yet."
          description={
            job.status === 'PUBLISHED'
              ? 'Workers whose evidence matches your requirements will see this role in their matched jobs. You can also search talent directly.'
              : 'This job is not published yet, so workers cannot see it.'
          }
          actionLabel={job.status === 'PUBLISHED' ? 'Search talent' : undefined}
          actionHref={job.status === 'PUBLISHED' ? '/employer/talent' : undefined}
        />
      ) : (
        <ApplicantList
          applicants={applicants.map((a) => ({
            applicationId: a.id,
            status: a.status,
            appliedAt: a.created_at.toISOString(),
            matchScore: a.match_score,
            matchExplanation: a.match_explanation as { reasons?: Array<{ factor: string; impact: string; explanation: string }>; gaps?: string[] } | null,
            coverNote: a.cover_note,
            worker: {
              name: a.full_name,
              headline: a.headline,
              location: a.region_name,
              readinessScore: a.readiness_score,
              verifiedSkillCount: a.verified_skill_count,
              rating: a.rating_count >= 3 && a.avg_rating ? Number(a.avg_rating) : null,
              ratingCount: a.rating_count,
              tasksCompleted: a.tasks_completed,
            },
          }))}
        />
      )}

      <Card className="mt-8">
        <h2 className="font-semibold">The posting</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{job.description}</p>
        {(job.required_skills ?? []).length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {(job.required_skills ?? []).map((slug) => (
              <Badge key={slug}>{slug.replace(/-/g, ' ')}</Badge>
            ))}
          </div>
        ) : null}
      </Card>
    </>
  );
}
