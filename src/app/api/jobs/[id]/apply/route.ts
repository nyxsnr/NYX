import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created } from '@/lib/http/response';
import { notFound } from '@/lib/http/errors';
import { optionalLongText, uuid } from '@/lib/validation/common';
import { getJob, jobRequirements } from '@/lib/domain/opportunities';
import { buildMatchProfile, requireWorkerProfile } from '@/lib/domain/workers';
import { computeMatch } from '@/lib/matching';
import { applyToJob } from '@/lib/domain/applications';

const params = z.object({ id: uuid });
const body = z.object({
  coverNote: optionalLongText(4000),
  answers: z
    .array(z.object({ questionId: z.string().max(80), answer: z.string().trim().max(4000) }))
    .max(10)
    .default([]),
  cvFileId: uuid.optional(),
});

export const POST = route(
  {
    params,
    body,
    auth: 'required',
    roles: ['WORKER'],
    permission: 'worker:apply',
    rateLimit: { name: 'apply', by: 'user' },
  },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    const job = await getJob(ctx.params.id);
    if (!job || job.status !== 'PUBLISHED') throw notFound('Job');

    // The match is computed and stored at submission time so the employer's
    // view of why this person applied cannot drift as the profile changes.
    const matchProfile = await buildMatchProfile(profile.id);
    const match = computeMatch(matchProfile, jobRequirements(job));

    const result = await applyToJob({
      jobId: job.id,
      workerProfileId: profile.id,
      workerUserId: ctx.auth.user.id,
      coverNote: ctx.body.coverNote ?? null,
      answers: ctx.body.answers,
      cvFileId: ctx.body.cvFileId ?? null,
      match,
    });

    return created({
      applicationId: result.applicationId,
      matchScore: match.score,
      matchBand: match.band,
      // Gaps are surfaced to the worker too, not just the employer: knowing
      // why an application is weak is what lets someone fix it.
      gaps: match.gaps,
    });
  },
);
