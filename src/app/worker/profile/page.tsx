import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { listWorkerSkills, requireWorkerProfile, serializeOwnProfile } from '@/lib/domain/workers';
import { sql } from '@/lib/db/client';
import { PageHeader } from '@/components/ui';
import { ProfileEditor } from './editor';

export const metadata: Metadata = { title: 'Your profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);
  const [skills, regions] = await Promise.all([
    listWorkerSkills(profile.id),
    sql<Array<{ id: string; name: string }>>`SELECT id, name FROM regions WHERE country_code = 'KE' ORDER BY name`,
  ]);

  return (
    <>
      <PageHeader
        title="Your profile"
        description="This is what employers see. Your phone number, exact location and earnings stay private unless you choose otherwise."
      />
      <ProfileEditor profile={serializeOwnProfile(profile, skills)} regions={regions} />
    </>
  );
}
