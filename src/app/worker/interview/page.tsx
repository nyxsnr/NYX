import Link from 'next/link';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { sql } from '@/lib/db/client';
import { Badge, Card, PageHeader, SectionHeading } from '@/components/ui';
import { StartInterview } from './start-interview';

export const metadata: Metadata = { title: 'Interview practice' };
export const dynamic = 'force-dynamic';

export default async function InterviewPage() {
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const sessions = await sql<
    Array<{ id: string; role_title: string; interview_kind: string; state: string; overall_score: number | null; started_at: Date }>
  >`
    SELECT id, role_title, interview_kind, state, overall_score, started_at
    FROM interview_sessions WHERE worker_profile_id = ${profile.id}
    ORDER BY started_at DESC LIMIT 20
  `;

  return (
    <>
      <PageHeader
        title="Interview practice"
        description="A real interviewer follows up when an answer is thin. So does this one. You are scored on structure, specificity and ownership — the three things that actually decide interviews."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <StartInterview />

        <div>
          <SectionHeading title="Your practice sessions" />
          {sessions.length === 0 ? (
            <Card>
              <p className="text-sm text-secondary">
                No practice sessions yet. One run takes about ten minutes and gives you a scored
                breakdown plus a model answer to learn from.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li key={session.id}>
                  <Link href={`/worker/interview/${session.id}`} className="card card-interactive flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{session.role_title}</p>
                      <p className="text-sm text-muted">
                        {session.interview_kind.toLowerCase()} · {new Date(session.started_at).toLocaleDateString('en-KE')}
                      </p>
                    </div>
                    {session.state === 'COMPLETED' && session.overall_score !== null ? (
                      <Badge tone={session.overall_score >= 70 ? 'success' : 'info'}>{session.overall_score}/100</Badge>
                    ) : (
                      <Badge tone="warning">In progress</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
