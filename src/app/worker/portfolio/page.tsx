import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { sql } from '@/lib/db/client';
import { PageHeader } from '@/components/ui';
import { PortfolioManager } from './manager';

export const metadata: Metadata = { title: 'Your portfolio' };
export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const items = await sql<
    Array<{ id: string; title: string; description: string | null; kind: string; external_url: string | null; completed_on: Date | null; evidence_level: string; skills: string[] | null }>
  >`
    SELECT p.id, p.title, p.description, p.kind, p.external_url, p.completed_on, p.evidence_level::text,
           (SELECT array_agg(s.slug) FROM portfolio_item_skills pis JOIN skills s ON s.id = pis.skill_id
             WHERE pis.item_id = p.id) AS skills
    FROM portfolio_items p
    WHERE p.worker_profile_id = ${profile.id} AND p.deleted_at IS NULL
    ORDER BY p.display_order, p.created_at DESC
  `;

  const skills = await sql<Array<{ slug: string; name: string }>>`
    SELECT slug, name FROM skills WHERE is_active ORDER BY demand_score DESC LIMIT 80
  `;

  return (
    <>
      <PageHeader
        title="Your portfolio"
        description="Real work you have done — paid or not. Employers look at this before they look at anything else."
      />
      <PortfolioManager
        items={items.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          kind: item.kind,
          externalUrl: item.external_url,
          completedOn: item.completed_on ? item.completed_on.toISOString().slice(0, 10) : null,
          evidenceLevel: item.evidence_level as 'SELF_REPORTED' | 'AI_INFERRED' | 'SIMULATION_VERIFIED' | 'EMPLOYER_VERIFIED',
          skills: item.skills ?? [],
        }))}
        availableSkills={skills}
      />
    </>
  );
}
