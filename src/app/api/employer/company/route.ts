import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { optionalLongText, optionalSafeUrl, optionalShortText, shortText, uuid } from '@/lib/validation/common';
import { getCompany, requireEmployer, serializeCompany } from '@/lib/domain/employers';
import { notFound } from '@/lib/http/errors';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';

export const GET = route({ auth: 'required', roles: ['EMPLOYER'] }, async (ctx) => {
  const employer = await requireEmployer(ctx.auth.user.id);
  const company = await getCompany(employer.companyId);
  if (!company) throw notFound('Company');

  // The owner may see their own registration identifiers; nobody else can.
  const identifiers = await sql<{ registration_number: string | null; tax_pin: string | null }[]>`
    SELECT registration_number, tax_pin FROM companies WHERE id = ${employer.companyId}
  `;

  return ok({
    ...serializeCompany(company),
    registrationNumber: identifiers[0]?.registration_number ?? null,
    taxPin: identifiers[0]?.tax_pin ?? null,
  });
});

const patch = z.object({
  name: shortText(150).optional(),
  description: optionalLongText(3000),
  industry: optionalShortText(100),
  sizeBracket: z.enum(['1-10', '11-50', '51-200', '201-500', '500+']).optional(),
  website: optionalSafeUrl,
  logoUrl: optionalShortText(500),
  regionId: uuid.optional(),
  town: optionalShortText(120),
  jobTitle: optionalShortText(120),
});

export const PATCH = route(
  { body: patch, auth: 'required', roles: ['EMPLOYER'], permission: 'employer:company:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const employer = await requireEmployer(ctx.auth.user.id);
    const b = ctx.body;

    await sql`
      UPDATE companies SET
        name = coalesce(${b.name ?? null}, name),
        description = coalesce(${b.description ?? null}, description),
        industry = coalesce(${b.industry ?? null}, industry),
        size_bracket = coalesce(${b.sizeBracket ?? null}, size_bracket),
        website = coalesce(${b.website ?? null}, website),
        logo_url = coalesce(${b.logoUrl ?? null}, logo_url),
        region_id = coalesce(${b.regionId ?? null}::uuid, region_id),
        town = coalesce(${b.town ?? null}, town)
      WHERE id = ${employer.companyId}
    `;

    if (b.jobTitle) {
      await sql`
        UPDATE employer_profiles SET job_title = ${b.jobTitle},
               onboarding_completed_at = coalesce(onboarding_completed_at, now())
        WHERE id = ${employer.employerProfileId}
      `;
      await track({ event: 'employer_onboarding_complete', userId: ctx.auth.user.id, role: 'EMPLOYER' });
    }

    await audit({
      actorId: ctx.auth.user.id,
      actorRole: 'EMPLOYER',
      action: 'company.updated',
      entityType: 'company',
      entityId: employer.companyId,
    });

    const company = await getCompany(employer.companyId);
    return ok(company ? serializeCompany(company) : null);
  },
);
