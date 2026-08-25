import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created, ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { optionalLongText, optionalSafeUrl, shortText, uuid } from '@/lib/validation/common';
import { recomputeReadiness, requireWorkerProfile } from '@/lib/domain/workers';
import { track } from '@/lib/analytics';

export const GET = route({ auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const rows = await sql<
    Array<{ id: string; title: string; description: string | null; kind: string; external_url: string | null;
      completed_on: Date | null; evidence_level: string; is_public: boolean; display_order: number; skills: string[] | null }>
  >`
    SELECT p.id, p.title, p.description, p.kind, p.external_url, p.completed_on,
           p.evidence_level::text, p.is_public, p.display_order,
           (SELECT array_agg(s.slug) FROM portfolio_item_skills pis
              JOIN skills s ON s.id = pis.skill_id WHERE pis.item_id = p.id) AS skills
    FROM portfolio_items p
    WHERE p.worker_profile_id = ${profile.id} AND p.deleted_at IS NULL
    ORDER BY p.display_order, p.created_at DESC
  `;
  return ok(rows);
});

const body = z.object({
  title: shortText(150),
  description: optionalLongText(2000),
  kind: z.enum(['IMAGE', 'DOCUMENT', 'WEBSITE', 'GITHUB', 'VIDEO', 'TEXT']).default('TEXT'),
  externalUrl: optionalSafeUrl,
  fileId: uuid.optional(),
  completedOn: z.coerce.date().optional(),
  skills: z.array(z.string().trim().max(100)).max(10).default([]),
  isPublic: z.boolean().default(true),
});

export const POST = route(
  { body, auth: 'required', roles: ['WORKER'], permission: 'worker:portfolio:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);

    const rows = await sql<{ id: string }[]>`
      INSERT INTO portfolio_items (
        worker_profile_id, title, description, kind, external_url, file_id, completed_on, is_public
      ) VALUES (
        ${profile.id}, ${ctx.body.title}, ${ctx.body.description ?? null}, ${ctx.body.kind},
        ${ctx.body.externalUrl ?? null}, ${ctx.body.fileId ?? null},
        ${ctx.body.completedOn ?? null}, ${ctx.body.isPublic}
      )
      RETURNING id
    `;
    const itemId = rows[0]?.id;
    if (!itemId) throw new Error('Could not save the portfolio item.');

    for (const slug of ctx.body.skills) {
      await sql`
        INSERT INTO portfolio_item_skills (item_id, skill_id)
        SELECT ${itemId}, id FROM skills WHERE slug = ${slug}
        ON CONFLICT DO NOTHING
      `;
    }

    const readiness = await recomputeReadiness(profile.id);
    await track({ event: 'portfolio_item_added', userId: ctx.auth.user.id, role: 'WORKER', properties: { kind: ctx.body.kind } });

    return created({
      id: itemId,
      readiness,
      // Portfolio items are the worker's own claim until something backs them.
      evidenceLevel: 'SELF_REPORTED',
    });
  },
);
