/**
 * The AI service.
 *
 * This is the only place in the codebase that talks to a model. Every call
 * goes through `run()`, which applies, in order: per-user spend limits,
 * provider dispatch, schema validation (inside the provider), output safety
 * inspection, and usage logging.
 *
 * Route handlers and UI code call typed methods here — they never construct a
 * prompt, never see a provider, and never handle raw model output.
 */
import 'server-only';
import { createHash } from 'node:crypto';
import type { ZodTypeAny, z } from 'zod';
import { json, sql } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';
import { AppError } from '@/lib/http/errors';
import type { AiMessage, AiProvider } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { DeterministicProvider } from './providers/mock';
import { PROMPT_VERSIONS, SYSTEM_PROMPTS, buildUserMessage, type AiOperation } from './prompts';
import { asUntrustedData, inspectAiOutput } from './safety';
import * as S from './schemas';

let providerInstance: AiProvider | null = null;

export function getProvider(): AiProvider {
  if (providerInstance) return providerInstance;
  providerInstance = getEnv().AI_PROVIDER === 'anthropic' ? new AnthropicProvider() : new DeterministicProvider();
  return providerInstance;
}

/** Test seam: swap the provider. */
export function setProvider(provider: AiProvider | null): void {
  providerInstance = provider;
}

export interface AiCallOptions {
  /** Whose budget this call is charged against, and who it is logged for. */
  userId?: string | null;
  /** Skip the daily limit — system jobs only, never user-triggered work. */
  system?: boolean;
}

interface RunArgs<T extends ZodTypeAny> {
  operation: AiOperation;
  schema: T;
  schemaName: string;
  instruction: string;
  payload: Record<string, unknown>;
  /**
   * User-authored content. It is delimited and appended after the instruction
   * so the model treats it as data, and is kept out of `payload` so it is not
   * rendered into the prompt twice. `key` is the field name the content is
   * merged back under when the structured input is handed to the provider.
   */
  untrusted?: Array<{ label: string; key: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  options: AiCallOptions;
}

export interface AiResult<T> {
  data: T;
  meta: {
    provider: string;
    model: string;
    promptVersion: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    inputDigest: string;
    /** Non-blocking safety observations, surfaced to admin review. */
    safetyFindings: string[];
  };
}

/**
 * Daily per-user cap on AI requests.
 *
 * Model calls cost real money and this platform serves users who cost nothing
 * to acquire; an unbounded loop in a client would be expensive. The cap is a
 * budget control, not an abuse signal — it returns a clear, non-alarming error.
 */
async function enforceDailyLimit(userId: string): Promise<void> {
  const limit = getEnv().AI_DAILY_REQUEST_LIMIT;
  const rows = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM ai_usage
    WHERE user_id = ${userId} AND created_at > now() - interval '24 hours' AND succeeded
  `;
  if (Number(rows[0]?.count ?? 0) >= limit) {
    throw new AppError(
      'RATE_LIMITED',
      `You have reached today's limit of ${limit} AI requests. It resets 24 hours after your first request today.`,
      { retryAfter: 3600 },
    );
  }
}

async function logUsage(
  operation: string,
  provider: string,
  model: string,
  userId: string | null,
  meta: { inputTokens: number; outputTokens: number; latencyMs: number },
  succeeded: boolean,
  errorCode?: string,
): Promise<void> {
  try {
    await sql`
      INSERT INTO ai_usage (user_id, operation, provider, model, input_tokens, output_tokens, latency_ms, succeeded, error_code)
      VALUES (${userId}, ${operation}, ${provider}, ${model}, ${meta.inputTokens}, ${meta.outputTokens}, ${meta.latencyMs}, ${succeeded}, ${errorCode ?? null})
    `;
  } catch (err) {
    // Usage logging must never break the user's request.
    console.error('[ai] failed to log usage', err);
  }
}

async function run<T extends ZodTypeAny>(args: RunArgs<T>): Promise<AiResult<z.infer<T>>> {
  const provider = getProvider();
  const userId = args.options.userId ?? null;

  if (userId && !args.options.system) await enforceDailyLimit(userId);

  const untrustedBlocks = (args.untrusted ?? [])
    .map(({ label, content }) => asUntrustedData(label, content))
    .join('\n\n');

  const userContent = [buildUserMessage(args.instruction, args.payload), untrustedBlocks]
    .filter(Boolean)
    .join('\n\n');

  // The structured input the provider receives includes the untrusted content
  // under its own key. The prompt-based provider ignores this (the same text is
  // already in `messages`); the deterministic provider computes from it.
  const providerInput: Record<string, unknown> = { ...args.payload };
  for (const block of args.untrusted ?? []) providerInput[block.key] = block.content;

  const messages: AiMessage[] = [{ role: 'user', content: userContent }];
  const inputDigest = createHash('sha256').update(userContent).digest('hex');

  try {
    const response = await provider.complete({
      operation: args.operation,
      system: SYSTEM_PROMPTS[args.operation],
      messages,
      schema: args.schema,
      schemaName: args.schemaName,
      input: providerInput,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
    });

    // Inspect any user-facing prose the model produced.
    const inspection = inspectAiOutput(JSON.stringify(response.data));
    if (!inspection.safe) {
      await logUsage(args.operation, provider.name, provider.model, userId, response.meta, false, 'SAFETY_BLOCK');
      throw new AppError(
        'AI_UNAVAILABLE',
        'The assistant produced a response that did not meet our safety rules, so it was discarded. Please try again.',
        { details: { findings: inspection.findings.map((f) => f.detail) } },
      );
    }

    await logUsage(args.operation, provider.name, provider.model, userId, response.meta, true);

    return {
      data: response.data,
      meta: {
        provider: response.meta.provider,
        model: response.meta.model,
        promptVersion: PROMPT_VERSIONS[args.operation],
        latencyMs: response.meta.latencyMs,
        inputTokens: response.meta.inputTokens,
        outputTokens: response.meta.outputTokens,
        inputDigest,
        safetyFindings: inspection.findings.map((f) => f.detail),
      },
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    await logUsage(args.operation, provider.name, provider.model, userId, { inputTokens: 0, outputTokens: 0, latencyMs: 0 }, false, 'PROVIDER_ERROR');
    throw new AppError(
      'AI_UNAVAILABLE',
      'The AI assistant is temporarily unavailable. Your work has not been lost — please try again shortly.',
      { cause: err },
    );
  }
}

/**
 * Persist a durable AI judgement so any score shown to a user is traceable.
 * Returns the assessment id, which callers attach to profile evidence.
 */
export async function recordAssessment(input: {
  kind: 'CV_ANALYSIS' | 'CAPABILITY_ASSESSMENT' | 'SIMULATION_EVALUATION' | 'INTERVIEW_EVALUATION' | 'APPLICATION_ANALYSIS' | 'TASK_DECOMPOSITION' | 'FRAUD_SIGNAL';
  subjectUserId?: string | null;
  workerProfileId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  result: unknown;
  confidence?: number | null;
  meta: AiResult<unknown>['meta'];
}): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ai_assessments (
      kind, subject_user_id, worker_profile_id, entity_type, entity_id,
      result, confidence, provider, model, prompt_version, input_digest,
      latency_ms, input_tokens, output_tokens
    ) VALUES (
      ${input.kind}, ${input.subjectUserId ?? null}, ${input.workerProfileId ?? null},
      ${input.entityType ?? null}, ${input.entityId ?? null},
      ${json(input.result)}, ${input.confidence ?? null},
      ${input.meta.provider}, ${input.meta.model}, ${input.meta.promptVersion}, ${input.meta.inputDigest},
      ${input.meta.latencyMs}, ${input.meta.inputTokens}, ${input.meta.outputTokens}
    )
    RETURNING id
  `;
  return rows[0]?.id ?? '';
}

// ===========================================================================
// Typed operations
// ===========================================================================

export const AIService = {
  /** Extract structured facts from an uploaded CV. */
  async analyzeCV(input: { cvText: string; knownSkillSlugs?: string[] }, options: AiCallOptions = {}) {
    return run({
      operation: 'analyzeCV',
      schema: S.cvAnalysisSchema,
      schemaName: 'CV analysis',
      instruction: 'Extract structured information from the CV supplied below.',
      payload: {
        cvText: input.cvText,
        availableSkillSlugs: input.knownSkillSlugs ?? [],
      },
      untrusted: [{ label: 'cv_document', key: 'cvText', content: input.cvText }],
      options,
    });
  },

  /** Assess what a person can currently do. */
  async assessCapabilities(
    input: {
      cvText?: string;
      statedSkills: string[];
      interests: string[];
      educationLevel?: string | null;
      yearsExperience: number;
      employmentStatus?: string | null;
      openToDiscovery: boolean;
      simulationResults?: Array<{ title: string; score: number; skills: string[] }>;
    },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'assessCapabilities',
      schema: S.capabilityAssessmentSchema,
      schemaName: 'capability assessment',
      instruction:
        'Assess what this person can currently do, based only on the evidence below. ' +
        (input.openToDiscovery
          ? 'This person has said they are not sure what work they can do, so lead with concrete possibilities and the evidence behind each.'
          : ''),
      payload: { ...input, cvText: undefined },
      untrusted: input.cvText ? [{ label: 'cv_document', key: 'cvText', content: input.cvText }] : undefined,
      options,
    });
  },

  /** Generate one concrete simulation instance from a human-authored template. */
  async generateSimulation(
    input: { template: Record<string, unknown>; seed: string },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'generateSimulation',
      schema: S.generatedSimulationSchema,
      schemaName: 'generated simulation',
      instruction: 'Create one concrete instance of this simulation template.',
      payload: input,
      temperature: 0.7,
      options,
    });
  },

  /** Score a simulation response against its rubric. */
  async evaluateSimulation(
    input: {
      simulation: Record<string, unknown>;
      rubric: unknown[];
      response: string;
      structuredResponse?: Record<string, unknown>;
      skillSlugs: string[];
    },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'evaluateSimulation',
      schema: S.simulationEvaluationSchema,
      schemaName: 'simulation evaluation',
      instruction: "Score the worker's response against the rubric supplied.",
      payload: { ...input, response: undefined },
      untrusted: [{ label: 'worker_response', key: 'response', content: input.response }],
      temperature: 0.1,
      options,
    });
  },

  /** Phrase the explanation for an already-computed match score. */
  async matchCandidate(
    input: {
      computedMatch: { score: number; reasons: unknown[]; gaps: string[] };
      opportunity: Record<string, unknown>;
      candidate: Record<string, unknown>;
    },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'matchCandidate',
      schema: S.candidateMatchSchema,
      schemaName: 'candidate match',
      instruction: 'Explain the supplied match score in plain language. Do not change the score.',
      payload: input,
      temperature: 0.2,
      options,
    });
  },

  /** Break an employer's project brief into publishable tasks. */
  async decomposeTask(
    input: { title?: string; brief: string; budgetKes?: number; deadline?: string },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'decomposeTask',
      schema: S.taskDecompositionSchema,
      schemaName: 'task decomposition',
      instruction: 'Break this project brief into discrete, publishable tasks.',
      payload: { ...input, brief: undefined },
      untrusted: [{ label: 'employer_brief', key: 'brief', content: input.brief }],
      options,
    });
  },

  /** Draft a job description from an employer's notes. */
  async generateJobDescription(
    input: {
      title: string;
      notes: string;
      companyName: string;
      employmentType: string;
      workArrangement: string;
      salaryHint?: string;
      location?: string;
    },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'generateJobDescription',
      schema: S.jobDescriptionSchema,
      schemaName: 'job description',
      instruction: "Draft a job description from the employer's notes.",
      payload: { ...input, notes: undefined },
      untrusted: [{ label: 'employer_notes', key: 'notes', content: input.notes }],
      options,
    });
  },

  /** Build an ordered improvement plan toward a target role. */
  async generateCareerPlan(
    input: {
      targetRole: string;
      readinessScore: number;
      readinessComponents: Record<string, number>;
      capabilities: string[];
      missingSkills: string[];
      simulationsCompleted: number;
      hasPortfolio: boolean;
    },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'generateCareerPlan',
      schema: S.careerPlanSchema,
      schemaName: 'career plan',
      instruction: 'Build a concrete plan to move this person toward the target role.',
      payload: input,
      options,
    });
  },

  /** Produce the next interview question. */
  async simulateInterview(
    input: {
      roleTitle: string;
      interviewKind: string;
      jobDescription?: string;
      previousQuestions: string[];
      lastAnswer?: string;
      maxQuestions: number;
    },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'simulateInterview',
      schema: S.interviewQuestionSchema,
      schemaName: 'interview question',
      instruction: 'Ask the next interview question.',
      payload: { ...input, lastAnswer: undefined },
      untrusted: input.lastAnswer ? [{ label: 'candidate_answer', key: 'lastAnswer', content: input.lastAnswer }] : undefined,
      temperature: 0.6,
      options,
    });
  },

  /** Score a completed interview transcript. */
  async evaluateInterview(
    input: { roleTitle: string; transcript: Array<{ role: string; content: string }> },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'evaluateInterview',
      schema: S.interviewEvaluationSchema,
      schemaName: 'interview evaluation',
      instruction: 'Score this interview transcript and give improvement feedback.',
      payload: { roleTitle: input.roleTitle, transcript: input.transcript },
      temperature: 0.1,
      options,
    });
  },

  /** Summarise an application for an employer's review queue. */
  async analyzeApplication(
    input: {
      requirements: string[];
      coverNote: string;
      workerSkills: string[];
      verifiedSkills: string[];
      simulationScores: Array<{ title: string; score: number }>;
    },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'analyzeApplication',
      schema: S.applicationAnalysisSchema,
      schemaName: 'application analysis',
      instruction: 'Summarise this application against the posting requirements.',
      payload: { ...input, coverNote: undefined },
      untrusted: [{ label: 'cover_note', key: 'coverNote', content: input.coverNote }],
      options,
    });
  },

  /** Assess content for fraud indicators. Advisory only. */
  async detectPotentialFraud(
    input: { entityType: string; content: string; context?: Record<string, unknown> },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'detectPotentialFraud',
      schema: S.fraudAnalysisSchema,
      schemaName: 'fraud analysis',
      instruction: 'Assess this content for fraud and scam indicators.',
      payload: { entityType: input.entityType, context: input.context ?? {} },
      untrusted: [{ label: 'content_under_review', key: 'content', content: input.content }],
      temperature: 0,
      options,
    });
  },

  /** Suggest improvements to CV wording. Never adds facts. */
  async improveCv(input: { sections: Record<string, string> }, options: AiCallOptions = {}) {
    return run({
      operation: 'improveCv',
      schema: S.cvImprovementSchema,
      schemaName: 'CV improvement',
      instruction: 'Suggest improvements to the wording the person already wrote.',
      payload: input,
      options,
    });
  },

  /** Draft a task proposal grounded strictly in profile evidence. */
  async draftProposal(
    input: {
      taskTitle: string;
      taskDescription: string;
      requirements: string[];
      verifiedSkills: string[];
      statedSkills: string[];
      completedTasks: number;
      simulationEvidence: Array<{ title: string; score: number }>;
    },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'draftProposal',
      schema: S.proposalDraftSchema,
      schemaName: 'proposal draft',
      instruction: 'Draft a proposal using only the evidence supplied.',
      payload: input,
      options,
    });
  },

  /** Career Agent conversational reply. */
  async agentReply(
    input: {
      message: string;
      workerName: string;
      readinessScore: number;
      readinessComponents: Record<string, number>;
      capabilities: string[];
      simulationsCompleted: number;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
    options: AiCallOptions = {},
  ) {
    return run({
      operation: 'agentReply',
      schema: S.agentReplySchema,
      schemaName: 'agent reply',
      instruction: "Reply to the worker's message as the KaziOS Career Agent.",
      payload: { ...input, message: undefined },
      untrusted: [{ label: 'worker_message', key: 'message', content: input.message }],
      temperature: 0.5,
      options,
    });
  },

  /** Provider health, surfaced on /api/health and the admin dashboard. */
  async health(): Promise<{ provider: string; model: string; healthy: boolean }> {
    const provider = getProvider();
    return { provider: provider.name, model: provider.model, healthy: await provider.healthy() };
  },
};

export type AIServiceType = typeof AIService;
