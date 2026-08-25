import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { notFound } from '@/lib/http/errors';
import { longText, optionalLongText, optionalShortText, uuid } from '@/lib/validation/common';
import { assertOwnsJob, requireEmployer } from '@/lib/domain/employers';
import { getJob, refreshOpportunityEmbedding, setJobSkills } from '@/lib/domain/opportunities';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';
import { skillLevel } from '@/lib/validation/common';

const params = z.object({ id: uuid });

export const GET = route({ params, auth: 'required', roles: ['EMPLOYER'] }, async (ctx) => {
  const employer = await requireEmployer(ctx.auth.user.id);
  await assertOwnsJob(employer.companyId, ctx.params.id);
  const job = await getJob(ctx.params.id);
  if (!job) throw notFound('Job');
  return ok(job);
});

const patch = z.object({
  title: optionalShortText(150),
  description: longText(20_000).optional(),
  responsibilities: optionalLongText(8000),
  deadline: z.coerce.date().optional(),
  openings: z.number().int().min(1).max(500).optional(),
  requiredSkills: z.array(z.object({ slug: z.string().max(100), minLevel: skillLevel.optional() })).max(15).optional(),
  preferredSkills: z.array(z.string().max(100)).max(15).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'FILLED']).optional(),
});

export const PATCH = route(
  { params, body: patch, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:job:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);
    await assertOwnsJob(employer.companyId, ctx.params.id);

    const current = await getJob(ctx.params.id);
    if (!current) throw notFound('Job');

    // A held posting cannot be self-published: only an admin clears moderation.
    const nextStatus =
      current.status === 'PENDING_REVIEW' && ctx.body.status === 'PUBLISHED' ? current.status : ctx.body.status;
    const publishing = nextStatus === 'PUBLISHED' && current.status !== 'PUBLISHED';

    await sql`
      UPDATE jobs SET
        title = coalesce(${ctx.body.title ?? null}, title),
        description = coalesce(${ctx.body.description ?? null}, description),
        responsibilities = coalesce(${ctx.body.responsibilities ?? null}, responsibilities),
        deadline = coalesce(${ctx.body.deadline ?? null}::date, deadline),
        openings = coalesce(${ctx.body.openings ?? null}, openings),
        status = coalesce(${nextStatus ?? null}::job_status, status),
        published_at = ${publishing ? sql`now()` : sql`published_at`},
        closed_at = ${nextStatus === 'CLOSED' || nextStatus === 'FILLED' ? sql`now()` : sql`closed_at`}
      WHERE id = ${ctx.params.id}
    `;

    if (ctx.body.requiredSkills || ctx.body.preferredSkills) {
      await setJobSkills(
        ctx.params.id,
        ctx.body.requiredSkills ?? (current.required_skills ?? []).map((slug) => ({ slug })),
        ctx.body.preferredSkills ?? current.preferred_skills ?? [],
      );
    }

    const updated = await getJob(ctx.params.id);
    if (updated) {
      await refreshOpportunityEmbedding('job', updated.id, {
        title: updated.title,
        description: updated.description,
        category: updated.category,
        skills: updated.required_skills ?? [],
      });
    }

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'EMPLOYER',
      action: 'job.updated',
      entityType: 'job',
      entityId: ctx.params.id,
      metadata: { status: nextStatus },
    });

    if (publishing) {
      await track({ event: 'job_posted', userId: ctx.auth.user.id, role: 'EMPLOYER', entityType: 'job', entityId: ctx.params.id });
    }

    return ok({
      ...updated,
      publishBlocked: current.status === 'PENDING_REVIEW' && ctx.body.status === 'PUBLISHED'
        ? 'This posting is held for review. An administrator must approve it before it can go live.'
        : null,
    });
  },
);

export const DELETE = route(
  { params, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:job:write' },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);
    await assertOwnsJob(employer.companyId, ctx.params.id);

    // Soft delete keeps applicants' records intact — a worker's application
    // history must not vanish because an employer tidied up.
    await sql`UPDATE jobs SET deleted_at = now(), status = 'CLOSED' WHERE id = ${ctx.params.id}`;

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'EMPLOYER',
      action: 'job.deleted',
      entityType: 'job',
      entityId: ctx.params.id,
    });

    return ok({ deleted: true });
  },
);
