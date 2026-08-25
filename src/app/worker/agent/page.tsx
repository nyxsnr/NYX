import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { getReadiness, requireWorkerProfile } from '@/lib/domain/workers';
import { PageHeader } from '@/components/ui';
import { AgentChat } from './chat';

export const metadata: Metadata = { title: 'Career agent' };
export const dynamic = 'force-dynamic';

export default async function AgentPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);
  const readiness = await getReadiness(profile.id);

  return (
    <>
      <PageHeader
        title="KaziOS Career Agent"
        description="Ask what to do next. It knows your profile, your readiness breakdown and your history, so the advice is about you — not generic career tips."
      />
      <AgentChat readinessScore={readiness.score} firstName={auth.user.fullName.split(' ')[0] ?? 'there'} />
    </>
  );
}
