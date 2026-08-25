import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { json, sql } from '@/lib/db/client';
import { conflict, forbidden, notFound } from '@/lib/http/errors';
import { uuid } from '@/lib/validation/common';
import { recomputeReadiness, requireWorkerProfile } from '@/lib/domain/workers';
import { AIService, recordAssessment } from '@/lib/ai/service';
import { PROMPT_VERSIONS } from '@/lib/ai/prompts';
import { track } from '@/lib/analytics';

const params = z.object({ id: uuid });
const MAX_QUESTIONS = 6;

interface TranscriptEntry {
  role: 'interviewer' | 'candidate';
  content: string;
  kind?: string;
  lookingFor?: string;
  at: string;
}

interface SessionRow {
  id: string;
  worker_profile_id: string;
  role_title: string;
  interview_kind: string;
  state: string;
  transcript: TranscriptEntry[];
  question_count: number;
  overall_score: number | null;
  dimension_scores: unknown;
  strengths: string[];
  improvements: string[];
  feedback: string | null;
}

async function loadSession(id: string, profileId: string): Promise<SessionRow> {
  const rows = await sql<SessionRow[]>`SELECT * FROM interview_sessions WHERE id = ${id}`;
  const session = rows[0];
  if (!session) throw notFound('Interview session');
  if (session.worker_profile_id !== profileId) throw forbidden('That is not your interview session.');
  return session;
}

export const GET = route({ params, auth: 'required', roles: ['WORKER'] }, async (ctx) => {
  const profile = await requireWorkerProfile(ctx.auth.user.id);
  const session = await loadSession(ctx.params.id, profile.id);
  const finished = session.state === 'COMPLETED';

  return ok({
    id: session.id,
    roleTitle: session.role_title,
    state: session.state,
    questionCount: session.question_count,
    totalQuestions: MAX_QUESTIONS,
    // While in progress the interviewer's internal notes stay hidden.
    transcript: session.transcript.map((entry) =>
      finished ? entry : { role: entry.role, content: entry.content, at: entry.at },
    ),
    overallScore: session.overall_score,
    dimensionScores: session.dimension_scores,
    strengths: session.strengths,
    improvements: session.improvements,
    feedback: session.feedback,
  });
});

const body = z.object({
  answer: z.string().trim().min(1, 'Write your answer before continuing.').max(6000),
});

/** Answer the current question; returns the next one, or the evaluation. */
export const POST = route(
  { params, body, auth: 'required', roles: ['WORKER'], permission: 'ai:use', rateLimit: { name: 'ai', by: 'user' } },
  async (ctx) => {
    const profile = await requireWorkerProfile(ctx.auth.user.id);
    const session = await loadSession(ctx.params.id, profile.id);
    if (session.state !== 'IN_PROGRESS') throw conflict('This interview has already finished.');

    const transcript: TranscriptEntry[] = [
      ...session.transcript,
      { role: 'candidate', content: ctx.body.answer, at: new Date().toISOString() },
    ];

    const askedSoFar = transcript.filter((t) => t.role === 'interviewer').length;

    if (askedSoFar < MAX_QUESTIONS) {
      const next = await AIService.simulateInterview(
        {
          roleTitle: session.role_title,
          interviewKind: session.interview_kind,
          previousQuestions: transcript.filter((t) => t.role === 'interviewer').map((t) => t.content),
          lastAnswer: ctx.body.answer,
          maxQuestions: MAX_QUESTIONS,
        },
        { userId: ctx.auth.user.id },
      );

      transcript.push({
        role: 'interviewer',
        content: next.data.question,
        kind: next.data.kind,
        lookingFor: next.data.lookingFor,
        at: new Date().toISOString(),
      });

      await sql`
        UPDATE interview_sessions
        SET transcript = ${json(transcript)}, question_count = ${askedSoFar + 1}
        WHERE id = ${session.id}
      `;

      return ok({
        finished: false,
        question: next.data.question,
        kind: next.data.kind,
        isFollowUp: next.data.isFollowUp,
        questionNumber: askedSoFar + 1,
        totalQuestions: MAX_QUESTIONS,
      });
    }

    // Final answer given — evaluate the whole transcript.
    const evaluation = await AIService.evaluateInterview(
      {
        roleTitle: session.role_title,
        transcript: transcript.map((t) => ({ role: t.role, content: t.content })),
      },
      { userId: ctx.auth.user.id },
    );

    await recordAssessment({
      kind: 'INTERVIEW_EVALUATION',
      subjectUserId: ctx.auth.user.id,
      workerProfileId: profile.id,
      entityType: 'interview_session',
      entityId: session.id,
      result: evaluation.data,
      meta: evaluation.meta,
    });

    await sql`
      UPDATE interview_sessions
      SET transcript = ${json(transcript)},
          state = 'COMPLETED',
          overall_score = ${evaluation.data.overallScore},
          dimension_scores = ${json(evaluation.data.dimensions)},
          strengths = ${evaluation.data.strengths},
          improvements = ${evaluation.data.improvements},
          feedback = ${evaluation.data.feedback},
          evaluator_version = ${`${evaluation.meta.provider}:${evaluation.meta.model}:${PROMPT_VERSIONS.evaluateInterview}`},
          completed_at = now()
      WHERE id = ${session.id}
    `;

    const readiness = await recomputeReadiness(profile.id);

    await track({
      event: 'interview_completed',
      userId: ctx.auth.user.id,
      role: 'WORKER',
      entityType: 'interview_session',
      entityId: session.id,
      properties: { score: evaluation.data.overallScore },
    });

    return ok({
      finished: true,
      overallScore: evaluation.data.overallScore,
      dimensions: evaluation.data.dimensions,
      strengths: evaluation.data.strengths,
      improvements: evaluation.data.improvements,
      feedback: evaluation.data.feedback,
      exampleAnswer: evaluation.data.exampleAnswer,
      readiness,
    });
  },
);
