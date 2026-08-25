import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireEmployer } from '@/lib/domain/employers';
import { sql } from '@/lib/db/client';
import { getWalletSummary } from '@/lib/payments/service';
import { PageHeader } from '@/components/ui';
import { TaskComposer } from './composer';

export const metadata: Metadata = { title: 'Create a task' };
export const dynamic = 'force-dynamic';

export default async function NewTaskPage() {
  const auth = await requireAuth(['EMPLOYER']);
  await requireEmployer(auth.user.id);

  const [regions, skills, wallet] = await Promise.all([
    sql<Array<{ id: string; name: string }>>`SELECT id, name FROM regions WHERE country_code = 'KE' ORDER BY name`,
    sql<Array<{ slug: string; name: string }>>`SELECT slug, name FROM skills WHERE is_active ORDER BY demand_score DESC LIMIT 120`,
    getWalletSummary(auth.user.id, 'EMPLOYER'),
  ]);

  return (
    <>
      <PageHeader
        title="Create a task"
        description="A specific piece of work with a clear output. The budget is locked in escrow when you assign someone, so workers know the money is real."
      />
      <TaskComposer regions={regions} skills={skills} availableBalance={wallet.available} />
    </>
  );
}
