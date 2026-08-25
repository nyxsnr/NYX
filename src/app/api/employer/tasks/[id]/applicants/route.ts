import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { uuid } from '@/lib/validation/common';
import { assertOwnsTask, requireEmployer } from '@/lib/domain/employers';
import { listTaskApplicants } from '@/lib/domain/applications';

const params = z.object({ id: uuid });

export const GET = route(
  { params, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:application:decide' },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);
    await assertOwnsTask(employer.companyId, ctx.params.id);

    const applicants = await listTaskApplicants(ctx.params.id);

    return ok(
      applicants.map((a) => ({
        applicationId: a.id,
        status: a.status,
        appliedAt: a.created_at,
        matchScore: a.match_score,
        matchExplanation: a.match_explanation,
        proposal: a.proposal,
        // Disclosed, because an employer should know when a proposal was
        // AI-drafted. It is not a mark against the worker.
        proposalAiAssisted: a.ai_assisted,
        bidAmount: a.bid_amount ? Number(a.bid_amount) : null,
        estimatedDays: a.estimated_days,
        worker: {
          profileId: a.worker_profile_id,
          name: a.full_name,
          headline: a.headline,
          photoUrl: a.photo_url,
          readinessScore: a.readiness_score,
          verifiedSkillCount: a.verified_skill_count,
          rating: a.rating_count >= 3 && a.avg_rating ? Number(a.avg_rating) : null,
          ratingCount: a.rating_count,
          tasksCompleted: a.tasks_completed,
          completionRate: a.completion_rate ? Number(a.completion_rate) : null,
        },
      })),
    );
  },
);
