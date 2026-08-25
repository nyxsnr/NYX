import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireEmployer } from '@/lib/domain/employers';
import { sql } from '@/lib/db/client';
import { PageHeader } from '@/components/ui';
import { JobComposer } from './composer';

export const metadata: Metadata = { title: 'Post a job' };
export const dynamic = 'force-dynamic';

export default async function NewJobPage() {
  const auth = await requireAuth(['EMPLOYER']);
  await requireEmployer(auth.user.id);

  const [regions, skills] = await Promise.all([
    sql<Array<{ id: string; name: string }>>`SELECT id, name FROM regions WHERE country_code = 'KE' ORDER BY name`,
    sql<Array<{ slug: string; name: string; category: string }>>`
      SELECT slug, name, category FROM skills WHERE is_active ORDER BY demand_score DESC, name
    `,
  ]);

  return (
    <>
      <PageHeader
        title="Post a job"
        description="Write it yourself, or describe the role in rough notes and let us draft it for you to review."
      />
      <JobComposer regions={regions} skills={skills} />
    </>
  );
}
