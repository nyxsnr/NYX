import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireWorkerProfile } from '@/lib/domain/workers';
import { sql } from '@/lib/db/client';
import { InterviewRoom } from './room';

export const metadata: Metadata = { title: 'Interview practice' };
export const dynamic = 'force-dynamic';

interface TranscriptEntry {
  role: 'interviewer' | 'candidate';
  content: string;
  at: string;
}

export default async function InterviewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAuth(['WORKER']);
  const profile = await requireWorkerProfile(auth.user.id);

  const rows = await sql<
    Array<{
      id: string; worker_profile_id: string; role_title: string; state: string;
      transcript: TranscriptEntry[]; question_count: number; overall_score: number | null;
      dimension_scores: Array<{ name: string; score: number; comment: string }>;
      strengths: string[]; improvements: string[]; feedback: string | null;
    }>
  >`SELECT * FROM interview_sessions WHERE id = ${id}`;

  const session = rows[0];
  if (!session || session.worker_profile_id !== profile.id) notFound();

  return (
    <InterviewRoom
      session={{
        id: session.id,
        roleTitle: session.role_title,
        state: session.state,
        // Interviewer notes are stripped: the candidate must not see what a
        // strong answer contains before they give theirs.
        transcript: session.transcript.map((entry) => ({ role: entry.role, content: entry.content })),
        questionCount: session.question_count,
        overallScore: session.overall_score,
        dimensions: session.dimension_scores ?? [],
        strengths: session.strengths,
        improvements: session.improvements,
        feedback: session.feedback,
      }}
    />
  );
}
