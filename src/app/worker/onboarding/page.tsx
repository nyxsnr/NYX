import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { sql } from '@/lib/db/client';
import { OnboardingWizard } from './wizard';

export const metadata: Metadata = { title: 'Set up your profile' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const [regions, skills] = await Promise.all([
    sql<Array<{ id: string; name: string }>>`
      SELECT id, name FROM regions WHERE country_code = 'KE' ORDER BY name
    `,
    sql<Array<{ slug: string; name: string; category: string }>>`
      SELECT slug, name, category FROM skills WHERE is_active ORDER BY demand_score DESC, name
    `,
  ]);

  return (
    <OnboardingWizard
      regions={regions}
      skills={skills}
      initial={{
        regionId: profile.region_id,
        town: profile.town,
        ageBracket: profile.age_bracket,
        educationLevel: profile.education_level,
        yearsExperience: profile.years_experience,
        employmentStatus: profile.employment_status,
        languages: profile.languages,
        hasSmartphone: profile.has_smartphone,
        hasLaptop: profile.has_laptop,
        internetAccess: profile.internet_access,
        desiredIncomeMin: profile.desired_income_min ? Number(profile.desired_income_min) : null,
        preferredWorkTypes: profile.preferred_work_types,
        workArrangement: profile.work_arrangement,
        openToDiscovery: profile.open_to_discovery,
      }}
    />
  );
}
