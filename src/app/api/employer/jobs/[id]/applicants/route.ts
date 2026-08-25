import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { uuid } from '@/lib/validation/common';
import { assertOwnsJob, requireEmployer } from '@/lib/domain/employers';
import { listJobApplicants } from '@/lib/domain/applications';

const params = z.object({ id: uuid });

/**
 * Applicants for one job, ranked with their explained match.
 *
 * Viewing marks unseen applications as VIEWED so response-rate metrics reflect
 * reality — workers are told how responsive an employer is.
 */
export const GET = route(
  { params, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:application:decide' },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);
    await assertOwnsJob(employer.companyId, ctx.params.id);

    const applicants = await listJobApplicants(ctx.params.id);

    await sql`
      UPDATE applications SET viewed_at = now(), status = 'VIEWED'
      WHERE job_id = ${ctx.params.id} AND status = 'SUBMITTED' AND viewed_at IS NULL
    `;

    return ok(
      applicants.map((a) => ({
        applicationId: a.id,
        status: a.status,
        appliedAt: a.created_at,
        matchScore: a.match_score,
        matchExplanation: a.match_explanation,
        coverNote: a.cover_note,
        worker: {
          profileId: a.worker_profile_id,
          name: a.full_name,
          headline: a.headline,
          photoUrl: a.photo_url,
          location: a.region_name,
          readinessScore: a.readiness_score,
          verifiedSkillCount: a.verified_skill_count,
          rating: a.rating_count >= 3 && a.avg_rating ? Number(a.avg_rating) : null,
          ratingCount: a.rating_count,
          tasksCompleted: a.tasks_completed,
        },
      })),
    );
  },
);
