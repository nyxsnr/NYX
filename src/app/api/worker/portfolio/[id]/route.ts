import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { notFound } from '@/lib/http/errors';
import { uuid } from '@/lib/validation/common';
import { recomputeReadiness, requireWorkerProfile } from '@/lib/domain/workers';

const params = z.object({ id: uuid });

export const DELETE = route(
  { params, auth: 'required', roles: ['WORKER'], permission: 'worker:portfolio:write' },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    // Soft delete, scoped to the owner: the WHERE clause is the authorization.
    const rows = await sql<{ id: string }[]>`
      UPDATE portfolio_items SET deleted_at = now()
      WHERE id = ${ctx.params.id} AND worker_profile_id = ${profile.id} AND deleted_at IS NULL
      RETURNING id
    `;
    if (!rows[0]) throw notFound('Portfolio item');

    await recomputeReadiness(profile.id);
    return ok({ deleted: true });
  },
);
