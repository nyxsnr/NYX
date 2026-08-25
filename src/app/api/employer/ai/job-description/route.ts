import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { employmentType, longText, optionalShortText, shortText, workArrangement } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { AIService } from '@/lib/ai/service';

const body = z.object({
  title: shortText(150),
  notes: longText(6000),
  employmentType,
  workArrangement,
  salaryHint: optionalShortText(120),
  location: optionalShortText(120),
});

/**
 * Draft a job description from an employer's rough notes.
 *
 * The response includes `warnings` for anything in the notes that would
 * discriminate on a protected characteristic; such wording is left out of the
 * draft and the employer is told why.
 */
export const POST = route(
  { body, auth: 'required', roles: ['EMPLOYER'], permission: 'ai:use', rateLimit: { name: 'ai', by: 'user' } },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);

    const draft = await AIService.generateJobDescription(
      {
        title: ctx.body.title,
        notes: ctx.body.notes,
        companyName: employer.companyName,
        employmentType: ctx.body.employmentType,
        workArrangement: ctx.body.workArrangement,
        salaryHint: ctx.body.salaryHint,
        location: ctx.body.location,
      },
      { userId: ctx.auth.user.id },
    );

    return ok({
      ...draft.data,
      notice: 'This is a draft. Review and edit it before publishing — you are responsible for what you post.',
    });
  },
);
