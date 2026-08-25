import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';

const query = z.object({ country: z.string().length(2).toUpperCase().default('KE') });

/** Regions (counties in Kenya) for the active market. */
export const GET = route({ query, rateLimit: { name: 'read', by: 'ip' } }, async (ctx) => {
  const rows = await sql<Array<{ id: string; name: string; code: string | null; region_label: string }>>`
    SELECT r.id, r.name, r.code, c.region_label
    FROM regions r JOIN countries c ON c.code = r.country_code
    WHERE r.country_code = ${ctx.query.country}
    ORDER BY r.name
  `;

  return ok(
    { label: rows[0]?.region_label ?? 'Region', regions: rows.map((r) => ({ id: r.id, name: r.name, code: r.code })) },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
});
