import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { analyseAndApply } from '../route';

const body = z.object({
  text: z.string().trim().min(80, 'Paste at least a few lines of your CV.').max(60_000),
});

/**
 * Analyse pasted CV text.
 *
 * This is the primary path for workers on phones, who often have their CV in a
 * WhatsApp message or a note rather than as a file.
 */
export const POST = route(
  { body, auth: 'required', roles: ['WORKER'], permission: 'worker:profile:write', rateLimit: { name: 'aiHeavy', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);

    await sql`UPDATE cv_documents SET is_primary = false WHERE worker_profile_id = ${profile.id}`;
    const rows = await sql<{ id: string }[]>`
      INSERT INTO cv_documents (worker_profile_id, raw_text, parse_state, is_primary)
      VALUES (${profile.id}, ${ctx.body.text}, 'PARSING', true)
      RETURNING id
    `;
    const documentId = rows[0]?.id ?? '';

    return ok(await analyseAndApply(profile.id, ctx.auth.user.id, documentId, ctx.body.text));
  },
);
