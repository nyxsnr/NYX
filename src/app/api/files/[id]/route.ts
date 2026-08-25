import { z } from 'zod';
import { NextResponse } from 'next/server';
import { route } from '@/lib/http/handler';
import { sql } from '@/lib/db/client';
import { forbidden, notFound } from '@/lib/http/errors';
import { uuid } from '@/lib/validation/common';
import { getStorage } from '@/lib/storage';

const params = z.object({ id: uuid });

/**
 * Download a file.
 *
 * Authorization is checked in the database, not by obscurity of the key: the
 * owner, an employer with a live application from that worker, and admins may
 * read. Everything is served as an attachment with `nosniff`, so an uploaded
 * document can never execute in a viewer's browser.
 */
export const GET = route({ params, auth: 'required', rateLimit: { name: 'read', by: 'user' } }, async (ctx) => {
  const rows = await sql<
    Array<{ id: string; owner_id: string; storage_key: string; file_name: string; content_type: string; is_public: boolean; purpose: string }>
  >`
    SELECT id, owner_id, storage_key, file_name, content_type, is_public, purpose
    FROM files WHERE id = ${ctx.params.id} AND deleted_at IS NULL
  `;
  const file = rows[0];
  if (!file) throw notFound('File');

  const isOwner = file.owner_id === ctx.auth.user.id;
  const isAdmin = ctx.auth.user.role === 'ADMIN';

  let allowed = isOwner || isAdmin || file.is_public;

  // An employer may read a candidate's CV only where that candidate has
  // actually applied to one of their postings, or is working on their task.
  if (!allowed && ctx.auth.user.role === 'EMPLOYER') {
    const linked = await sql<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM applications a
        JOIN jobs j ON j.id = a.job_id
        JOIN worker_profiles wp ON wp.id = a.worker_profile_id
        WHERE j.posted_by = ${ctx.auth.user.id} AND wp.user_id = ${file.owner_id}
        UNION ALL
        SELECT 1 FROM task_assignments ta
        JOIN tasks t ON t.id = ta.task_id
        JOIN worker_profiles wp2 ON wp2.id = ta.worker_profile_id
        WHERE t.posted_by = ${ctx.auth.user.id} AND wp2.user_id = ${file.owner_id}
      ) AS ok
    `;
    allowed = linked[0]?.ok ?? false;
  }

  if (!allowed) throw forbidden('You do not have access to this file.');

  const bytes = await getStorage().get(file.storage_key);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': file.content_type,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${file.file_name.replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});
