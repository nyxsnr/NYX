import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireEmployer } from '@/lib/domain/employers';
import { sql } from '@/lib/db/client';
import { PageHeader } from '@/components/ui';
import { TalentSearch } from './search';

export const metadata: Metadata = { title: 'Find talent' };
export const dynamic = 'force-dynamic';

export default async function TalentPage() {
  const auth = await requireAuth(['EMPLOYER']);
  await requireEmployer(auth.user.id);

  const [skills, regions] = await Promise.all([
    sql<Array<{ slug: string; name: string }>>`SELECT slug, name FROM skills WHERE is_active ORDER BY demand_score DESC LIMIT 120`,
    sql<Array<{ id: string; name: string }>>`SELECT id, name FROM regions WHERE country_code = 'KE' ORDER BY name`,
  ]);

  return (
    <>
      <PageHeader
        title="Find talent"
        description="Search by capability. Only workers who chose to be searchable appear, and you see evidence rather than personal details."
      />
      <TalentSearch skills={skills} regions={regions} />
    </>
  );
}
