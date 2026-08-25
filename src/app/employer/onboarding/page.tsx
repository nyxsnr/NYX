import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { PageHeader } from '@/components/ui';
import { CompanyForm } from '../company/company-form';

export const metadata: Metadata = { title: 'Set up your company' };
export const dynamic = 'force-dynamic';

export default async function EmployerOnboarding() {
  const auth = await requireAuth(['EMPLOYER']);

  const [companies, regions] = await Promise.all([
    sql<Array<{ id: string; name: string; description: string | null; industry: string | null; size_bracket: string | null; website: string | null; region_id: string | null; town: string | null }>>`
      SELECT c.id, c.name, c.description, c.industry, c.size_bracket, c.website, c.region_id, c.town
      FROM companies c JOIN employer_profiles ep ON ep.company_id = c.id
      WHERE ep.user_id = ${auth.user.id}
    `,
    sql<Array<{ id: string; name: string }>>`SELECT id, name FROM regions WHERE country_code = 'KE' ORDER BY name`,
  ]);

  const company = companies[0];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Set up your company"
        description="Workers see this before they apply. A complete profile gets materially more qualified applicants."
      />
      <CompanyForm
        regions={regions}
        initial={{
          name: company?.name ?? '',
          description: company?.description ?? '',
          industry: company?.industry ?? '',
          sizeBracket: company?.size_bracket ?? '',
          website: company?.website ?? '',
          regionId: company?.region_id ?? '',
          town: company?.town ?? '',
          jobTitle: '',
        }}
        redirectTo="/employer"
        submitLabel="Save and continue"
      />
    </div>
  );
}
