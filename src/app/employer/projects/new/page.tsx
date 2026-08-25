import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireEmployer } from '@/lib/domain/employers';
import { getWalletSummary } from '@/lib/payments/service';
import { PageHeader } from '@/components/ui';
import { ProjectDecomposer } from './decomposer';

export const metadata: Metadata = { title: 'Describe a project' };
export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  const auth = await requireAuth(['EMPLOYER']);
  await requireEmployer(auth.user.id);
  const wallet = await getWalletSummary(auth.user.id, 'EMPLOYER');

  return (
    <>
      <PageHeader
        title="Describe a project"
        description="Say what you need in plain language. We break it into discrete tasks with effort and budget estimates — and publish nothing until you approve it."
      />
      <ProjectDecomposer availableBalance={wallet.available} />
    </>
  );
}
