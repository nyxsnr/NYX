import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import {
  ageBracket, educationLevel, employmentStatus, employmentType, incomePeriod,
  internetAccess, languageCode, moneyMinor, optionalLongText, optionalShortText,
  uuid, workArrangement,
} from '@/lib/validation/common';
import {
  listWorkerSkills, recomputeReadiness, refreshWorkerEmbedding,
  requireWorkerProfile, serializeOwnProfile,
} from '@/lib/domain/workers';
import { track } from '@/lib/analytics';

export const GET = route({ auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const skills = await listWorkerSkills(profile.id);
  return ok(serializeOwnProfile(profile, skills));
});

const patch = z.object({
  headline: optionalShortText(140),
  summary: optionalLongText(2000),
  photoUrl: optionalShortText(500),
  regionId: uuid.optional(),
  town: optionalShortText(120),
  ageBracket: ageBracket.optional(),
  educationLevel: educationLevel.optional(),
  fieldOfStudy: optionalShortText(150),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  employmentStatus: employmentStatus.optional(),
  languages: z.array(languageCode).max(10).optional(),
  interests: z.array(z.string().trim().max(60)).max(15).optional(),
  hasSmartphone: z.boolean().optional(),
  hasLaptop: z.boolean().optional(),
  internetAccess: internetAccess.optional(),
  desiredIncomeMin: moneyMinor.optional(),
  desiredIncomeMax: moneyMinor.optional(),
  incomePeriod: incomePeriod.optional(),
  preferredWorkTypes: z.array(employmentType).max(7).optional(),
  workArrangement: workArrangement.optional(),
  willingToRelocate: z.boolean().optional(),
  hoursPerWeek: z.number().int().min(0).max(80).optional(),
  availableFrom: z.coerce.date().optional(),
  isAvailable: z.boolean().optional(),
  openToDiscovery: z.boolean().optional(),
  // Privacy is the worker's decision, always.
  isSearchable: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showExactLocation: z.boolean().optional(),
  showEarnings: z.boolean().optional(),
  onboardingStep: z.enum(['BASICS', 'BACKGROUND', 'PREFERENCES', 'SKILLS', 'CV', 'DONE']).optional(),
})
  .refine(
    (v) => v.desiredIncomeMin === undefined || v.desiredIncomeMax === undefined || v.desiredIncomeMax >= v.desiredIncomeMin,
    { message: 'Maximum income must be at least the minimum.', path: ['desiredIncomeMax'] },
  );

export const PATCH = route(
  { body: patch, auth: 'required', roles: ['WORKER'], permission: 'worker:profile:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    const b = ctx.body;
    const completingOnboarding = b.onboardingStep === 'DONE' && !profile.onboarding_completed_at;

    // coalesce() means an omitted field is left untouched, so a partial save
    // from a phone that lost signal mid-form cannot blank out earlier answers.
    await sql`
      UPDATE worker_profiles SET
        headline = coalesce(${b.headline ?? null}, headline),
        summary = coalesce(${b.summary ?? null}, summary),
        photo_url = coalesce(${b.photoUrl ?? null}, photo_url),
        region_id = coalesce(${b.regionId ?? null}::uuid, region_id),
        town = coalesce(${b.town ?? null}, town),
        age_bracket = coalesce(${b.ageBracket ?? null}, age_bracket),
        education_level = coalesce(${b.educationLevel ?? null}::education_level, education_level),
        field_of_study = coalesce(${b.fieldOfStudy ?? null}, field_of_study),
        years_experience = coalesce(${b.yearsExperience ?? null}, years_experience),
        employment_status = coalesce(${b.employmentStatus ?? null}::employment_status, employment_status),
        languages = coalesce(${b.languages ?? null}::text[], languages),
        interests = coalesce(${b.interests ?? null}::text[], interests),
        has_smartphone = coalesce(${b.hasSmartphone ?? null}, has_smartphone),
        has_laptop = coalesce(${b.hasLaptop ?? null}, has_laptop),
        internet_access = coalesce(${b.internetAccess ?? null}, internet_access),
        desired_income_min = coalesce(${b.desiredIncomeMin ?? null}::bigint, desired_income_min),
        desired_income_max = coalesce(${b.desiredIncomeMax ?? null}::bigint, desired_income_max),
        income_period = coalesce(${b.incomePeriod ?? null}, income_period),
        preferred_work_types = coalesce(${b.preferredWorkTypes ?? null}::employment_type[], preferred_work_types),
        work_arrangement = coalesce(${b.workArrangement ?? null}::work_arrangement, work_arrangement),
        willing_to_relocate = coalesce(${b.willingToRelocate ?? null}, willing_to_relocate),
        hours_per_week = coalesce(${b.hoursPerWeek ?? null}, hours_per_week),
        available_from = coalesce(${b.availableFrom ?? null}::date, available_from),
        is_available = coalesce(${b.isAvailable ?? null}, is_available),
        open_to_discovery = coalesce(${b.openToDiscovery ?? null}, open_to_discovery),
        is_searchable = coalesce(${b.isSearchable ?? null}, is_searchable),
        show_phone = coalesce(${b.showPhone ?? null}, show_phone),
        show_exact_location = coalesce(${b.showExactLocation ?? null}, show_exact_location),
        show_earnings = coalesce(${b.showEarnings ?? null}, show_earnings),
        onboarding_step = coalesce(${b.onboardingStep ?? null}, onboarding_step),
        onboarding_completed_at = ${completingOnboarding ? sql`now()` : sql`onboarding_completed_at`}
      WHERE id = ${profile.id}
    `;

    await refreshWorkerEmbedding(profile.id);
    const readiness = await recomputeReadiness(profile.id);

    if (completingOnboarding) {
      await track({ event: 'onboarding_complete', userId: ctx.auth.user.id, role: 'WORKER' });
    }

    const updated = await requireWorkerProfile(ctx.auth.user.id);
    const skills = await listWorkerSkills(profile.id);
    return ok({ profile: serializeOwnProfile(updated, skills), readiness });
  },
);
