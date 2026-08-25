import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created } from '@/lib/http/response';
import { longText, optionalLongText, safeUrl, uuid } from '@/lib/validation/common';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { submitWork } from '@/lib/domain/applications';

const params = z.object({ id: uuid });
const body = z.object({
  summary: longText(3000),
  content: optionalLongText(50_000),
  externalLinks: z.array(safeUrl).max(10).default([]),
  fileIds: z.array(uuid).max(10).default([]),
});

/** Submit completed work for review. */
export const POST = route(
  { params, body, auth: 'required', roles: ['WORKER'], rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    await requireWorkerProfile(ctx.auth.user.id);

    const result = await submitWork({
      assignmentId: ctx.params.id,
      workerUserId: ctx.auth.user.id,
      summary: ctx.body.summary,
      content: ctx.body.content ?? null,
      externalLinks: ctx.body.externalLinks,
      fileIds: ctx.body.fileIds,
    });

    return created({
      ...result,
      message:
        'Your work has been sent for review. Payment is released to your balance as soon as the employer approves it.',
    });
  },
);
