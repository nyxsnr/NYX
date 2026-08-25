import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { sql } from '@/lib/db/client';
import { PageHeader } from '@/components/ui';
import { CvPanel } from './cv-panel';

export const metadata: Metadata = { title: 'Your CV' };
export const dynamic = 'force-dynamic';

export default async function CvPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const documents = await sql<
    Array<{ id: string; parse_state: string; parsed: unknown; created_at: Date; file_name: string | null; parse_error: string | null }>
  >`
    SELECT c.id, c.parse_state, c.parsed, c.created_at, c.parse_error, f.file_name
    FROM cv_documents c
    LEFT JOIN files f ON f.id = c.file_id
    WHERE c.worker_profile_id = ${profile.id}
    ORDER BY c.created_at DESC
    LIMIT 5
  `;

  return (
    <>
      <PageHeader
        title="Your CV"
        description="Upload a file or paste the text. We will read it and show you exactly what we found — and where we found it."
      />
      <CvPanel
        documents={documents.map((d) => ({
          id: d.id,
          parseState: d.parse_state,
          parsed: d.parsed,
          createdAt: d.created_at.toISOString(),
          fileName: d.file_name,
          parseError: d.parse_error,
        }))}
      />
    </>
  );
}
