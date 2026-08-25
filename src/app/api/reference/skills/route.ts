import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';

const query = z.object({
  category: z.string().max(80).optional(),
  q: z.string().max(80).optional(),
});

/** The skill taxonomy, for pickers and filters. Public and cacheable. */
export const GET = route({ query, rateLimit: { name: 'read', by: 'ip' } }, async (ctx) => {
  const rows = await sql<Array<{ slug: string; name: string; category: string; demand_score: number }>>`
    SELECT slug, name, category, demand_score
    FROM skills
    WHERE is_active
      AND (${ctx.query.category ?? null}::text IS NULL OR category = ${ctx.query.category ?? null})
      AND (${ctx.query.q ?? null}::text IS NULL
           OR name ILIKE '%' || ${ctx.query.q ?? ''} || '%'
           OR ${ctx.query.q ?? ''} = ANY(aliases))
    ORDER BY demand_score DESC, name
    LIMIT 200
  `;

  return ok(
    rows.map((r) => ({ slug: r.slug, name: r.name, category: r.category, demandScore: r.demand_score })),
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } },
  );
});
