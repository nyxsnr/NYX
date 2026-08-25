import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { skillLevel } from '@/lib/validation/common';
import {
  listWorkerSkills, recomputeReadiness, refreshWorkerEmbedding,
  removeWorkerSkill, requireWorkerProfile, serializeSkill, upsertWorkerSkill,
} from '@/lib/domain/workers';
import { AppError } from '@/lib/http/errors';

export const GET = route({ auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  return ok((await listWorkerSkills(profile.id)).map(serializeSkill));
});

const body = z.object({
  skills: z
    .array(
      z.object({
        slug: z.string().trim().min(1).max(100),
        level: skillLevel.optional(),
        yearsExperience: z.number().int().min(0).max(60).optional(),
      }),
    )
    .min(1)
    .max(30),
});

/**
 * Add self-reported skills.
 *
 * These enter the ledger as SELF_REPORTED — the weakest evidence tier. They
 * make a worker discoverable, but carry roughly a third of the matching weight
 * of a proven skill, and the UI labels them as unverified.
 */
export const POST = route(
  { body, auth: 'required', roles: ['WORKER'], permission: 'worker:profile:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);

    const unknown: string[] = [];
    for (const skill of ctx.body.skills) {
      const added = await upsertWorkerSkill(profile.id, {
        skillSlug: skill.slug,
        selfReportedLevel: skill.level ?? 'INTERMEDIATE',
        evidenceLevel: 'SELF_REPORTED',
        yearsExperience: skill.yearsExperience ?? null,
        source: 'ONBOARDING',
      });
      if (!added) unknown.push(skill.slug);
    }

    await refreshWorkerEmbedding(profile.id);
    const readiness = await recomputeReadiness(profile.id);
    const skills = await listWorkerSkills(profile.id);

    return ok({
      skills: skills.map(serializeSkill),
      readiness,
      // Reported rather than silently dropped, so a typo is visible.
      unrecognised: unknown,
    });
  },
);

const del = z.object({ slug: z.string().trim().min(1).max(100) });

export const DELETE = route(
  { body: del, auth: 'required', roles: ['WORKER'], permission: 'worker:profile:write' },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    const removed = await removeWorkerSkill(profile.id, ctx.body.slug);
    if (!removed) {
      throw new AppError(
        'CONFLICT',
        'That skill is backed by verified evidence and cannot be removed. Verified results stay on your profile so employers can trust them.',
      );
    }
    await recomputeReadiness(profile.id);
    return ok({ removed: true });
  },
);
