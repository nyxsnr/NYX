/**
 * Structured output contracts for every AI operation.
 *
 * Nothing a model returns is used until it has passed the matching schema
 * here. A model that hallucinates an extra field, omits a score, or returns
 * prose instead of JSON produces a validation error, not corrupt data in a
 * worker's profile.
 *
 * Evidence discipline: extraction schemas carry a `sourceQuote` wherever a
 * claim is made about a person, so any inference can be traced back to the
 * text it came from.
 */
import { z } from 'zod';

const score = z.number().int().min(0).max(100);
const confidence = z.number().min(0).max(1);
const level = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']);

// ---------------------------------------------------------------------------
// analyzeCV
// ---------------------------------------------------------------------------
export const cvEducationSchema = z.object({
  institution: z.string().max(200),
  qualification: z.string().max(200),
  fieldOfStudy: z.string().max(200).nullable(),
  startYear: z.number().int().min(1950).max(2100).nullable(),
  endYear: z.number().int().min(1950).max(2100).nullable(),
  // Present only when the CV literally says it. Never inferred.
  grade: z.string().max(100).nullable(),
});

export const cvExperienceSchema = z.object({
  employer: z.string().max(200),
  role: z.string().max(200),
  startDate: z.string().max(20).nullable(),
  endDate: z.string().max(20).nullable(),
  isCurrent: z.boolean(),
  responsibilities: z.array(z.string().max(500)).max(15),
  /** Verbatim from the CV; used to show the worker what we read. */
  sourceQuote: z.string().max(600).nullable(),
});

export const cvSkillSchema = z.object({
  name: z.string().max(100),
  /** Matched against the platform taxonomy where possible. */
  skillSlug: z.string().max(100).nullable(),
  level: level.nullable(),
  confidence,
  /** Where in the CV this came from. Empty means the model inferred it. */
  sourceQuote: z.string().max(400).nullable(),
});

export const cvAnalysisSchema = z.object({
  fullName: z.string().max(200).nullable(),
  email: z.string().max(254).nullable(),
  phone: z.string().max(40).nullable(),
  location: z.string().max(200).nullable(),
  /** A summary of what the CV says, not a sales pitch. */
  summary: z.string().max(1500),
  totalYearsExperience: z.number().min(0).max(60).nullable(),
  education: z.array(cvEducationSchema).max(15),
  experience: z.array(cvExperienceSchema).max(25),
  skills: z.array(cvSkillSchema).max(60),
  certifications: z.array(z.string().max(200)).max(25),
  achievements: z.array(z.string().max(400)).max(20),
  industries: z.array(z.string().max(100)).max(15),
  languages: z.array(z.string().max(60)).max(12),
  /** Gaps, inconsistencies, missing contact details — shown to the worker only. */
  observations: z.array(z.string().max(300)).max(10),
  extractionConfidence: confidence,
});
export type CvAnalysis = z.infer<typeof cvAnalysisSchema>;

// ---------------------------------------------------------------------------
// assessCapabilities
// ---------------------------------------------------------------------------
export const capabilitySchema = z.object({
  skillSlug: z.string().max(100),
  displayName: z.string().max(120),
  level,
  confidence,
  /** Why the model believes this — shown verbatim in the UI. */
  rationale: z.string().max(400),
  /** Always AI_INFERRED from this operation; upgraded only by real evidence. */
  basis: z.enum(['STATED', 'INFERRED_FROM_EXPERIENCE', 'INFERRED_FROM_EDUCATION', 'TRANSFERABLE']),
});

export const careerPathSchema = z.object({
  title: z.string().max(150),
  fitScore: score,
  rationale: z.string().max(500),
  typicalEntryRoute: z.string().max(400),
  missingSkills: z.array(z.string().max(100)).max(10),
  /** Kenyan market context, stated as a range and clearly labelled indicative. */
  indicativeMonthlyIncomeKes: z
    .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
    .nullable(),
});

export const capabilityAssessmentSchema = z.object({
  summary: z.string().max(1500),
  capabilities: z.array(capabilitySchema).max(40),
  transferableSkills: z
    .array(z.object({ skill: z.string().max(120), fromContext: z.string().max(300), appliesTo: z.array(z.string().max(120)).max(6) }))
    .max(15),
  missingSkills: z
    .array(z.object({ skill: z.string().max(120), whyItMatters: z.string().max(300), howToGet: z.string().max(400) }))
    .max(15),
  recommendedCareerPaths: z.array(careerPathSchema).max(6),
  recommendedWorkCategories: z.array(z.string().max(100)).max(10),
  recommendedSimulations: z.array(z.string().max(100)).max(8),
  /** The model's read on readiness. The authoritative score is computed, not asked for. */
  readinessSignals: z.object({
    skillEvidence: score,
    communication: score,
    experienceDepth: score,
    notes: z.string().max(600),
  }),
  overallConfidence: confidence,
});
export type CapabilityAssessment = z.infer<typeof capabilityAssessmentSchema>;

// ---------------------------------------------------------------------------
// generateSimulation / evaluateSimulation
// ---------------------------------------------------------------------------
export const generatedSimulationSchema = z.object({
  title: z.string().max(200),
  /** Everything the worker reads before starting. */
  brief: z.string().max(4000),
  /** Structured exercise material: emails, rows, tickets, a customer message. */
  materials: z.record(z.unknown()),
  successCriteria: z.array(z.string().max(300)).max(10),
  estimatedMinutes: z.number().int().min(5).max(120),
});
export type GeneratedSimulation = z.infer<typeof generatedSimulationSchema>;

export const criterionScoreSchema = z.object({
  key: z.string().max(60),
  label: z.string().max(120),
  score,
  /** Must cite the response. An unevidenced score is rejected downstream. */
  evidence: z.string().max(600),
});

export const simulationEvaluationSchema = z.object({
  overallScore: score,
  criterionScores: z.array(criterionScoreSchema).min(1).max(10),
  strengths: z.array(z.string().max(300)).max(8),
  weaknesses: z.array(z.string().max(300)).max(8),
  /** Written to the worker, second person, specific and actionable. */
  feedback: z.string().max(3000),
  /** Skills this attempt genuinely demonstrates, for the capability ledger. */
  demonstratedSkills: z.array(z.object({ skillSlug: z.string().max(100), level, confidence })).max(10),
  /** True when the response is empty, off-topic or obviously not a real attempt. */
  invalidAttempt: z.boolean(),
});
export type SimulationEvaluation = z.infer<typeof simulationEvaluationSchema>;

// ---------------------------------------------------------------------------
// matchCandidate
// ---------------------------------------------------------------------------
export const matchReasonSchema = z.object({
  factor: z.string().max(120),
  impact: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']),
  weight: z.number().min(0).max(1),
  explanation: z.string().max(400),
});

export const candidateMatchSchema = z.object({
  score,
  reasons: z.array(matchReasonSchema).min(1).max(12),
  gaps: z.array(z.string().max(300)).max(8),
  /** Advisory only. A human always makes the hiring decision. */
  recommendation: z.enum(['STRONG_FIT', 'WORTH_REVIEWING', 'WEAK_FIT']),
  summary: z.string().max(800),
});
export type CandidateMatch = z.infer<typeof candidateMatchSchema>;

// ---------------------------------------------------------------------------
// decomposeTask
// ---------------------------------------------------------------------------
export const decomposedTaskSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(3000),
  expectedOutput: z.string().max(1000),
  category: z.string().max(100),
  requiredSkills: z.array(z.string().max(100)).max(10),
  estimatedHours: z.number().min(0.5).max(500),
  suggestedBudgetKes: z.number().int().min(0),
  workersNeeded: z.number().int().min(1).max(50),
  qualityRequirements: z.string().max(1000),
  dependsOn: z.array(z.number().int().min(0)).max(10),
});

export const taskDecompositionSchema = z.object({
  projectTitle: z.string().max(200),
  interpretation: z.string().max(1500),
  tasks: z.array(decomposedTaskSchema).min(1).max(15),
  totalEstimatedHours: z.number().min(0),
  totalSuggestedBudgetKes: z.number().int().min(0),
  suggestedWorkerProfiles: z.array(z.string().max(200)).max(8),
  assumptions: z.array(z.string().max(300)).max(10),
  /** Questions the employer should answer before publishing. */
  clarifyingQuestions: z.array(z.string().max(300)).max(8),
});
export type TaskDecomposition = z.infer<typeof taskDecompositionSchema>;

// ---------------------------------------------------------------------------
// generateJobDescription
// ---------------------------------------------------------------------------
export const jobDescriptionSchema = z.object({
  title: z.string().max(200),
  summary: z.string().max(2000),
  responsibilities: z.array(z.string().max(400)).min(1).max(15),
  requirements: z.array(z.string().max(400)).max(15),
  niceToHave: z.array(z.string().max(400)).max(10),
  suggestedSkills: z.array(z.string().max(100)).max(15),
  suggestedApplicationQuestions: z.array(z.string().max(300)).max(6),
  /** Flags inclusive-language or compliance problems in the employer's input. */
  warnings: z.array(z.string().max(300)).max(6),
});
export type JobDescription = z.infer<typeof jobDescriptionSchema>;

// ---------------------------------------------------------------------------
// generateCareerPlan
// ---------------------------------------------------------------------------
export const careerPlanStepSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().max(200),
  description: z.string().max(1000),
  /** Concrete on-platform action where one exists. */
  actionType: z.enum(['SIMULATION', 'PROFILE', 'PORTFOLIO', 'APPLY', 'LEARN', 'INTERVIEW_PRACTICE']),
  actionRef: z.string().max(120).nullable(),
  estimatedDays: z.number().int().min(1).max(365),
  expectedImpact: z.string().max(300),
});

export const careerPlanSchema = z.object({
  currentPosition: z.string().max(800),
  targetRole: z.string().max(200),
  fitAssessment: z.string().max(1000),
  steps: z.array(careerPlanStepSchema).min(1).max(12),
  timelineWeeks: z.number().int().min(1).max(104),
  /** Explicitly not a promise of employment. */
  caveats: z.array(z.string().max(300)).max(6),
});
export type CareerPlan = z.infer<typeof careerPlanSchema>;

// ---------------------------------------------------------------------------
// simulateInterview / evaluateInterview
// ---------------------------------------------------------------------------
export const interviewQuestionSchema = z.object({
  question: z.string().max(1000),
  kind: z.enum(['BEHAVIOURAL', 'TECHNICAL', 'SITUATIONAL', 'SCREENING', 'CLOSING']),
  isFollowUp: z.boolean(),
  /** What a strong answer contains — revealed only in feedback, never up front. */
  lookingFor: z.string().max(600),
  isFinal: z.boolean(),
});
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;

export const interviewEvaluationSchema = z.object({
  overallScore: score,
  dimensions: z
    .array(z.object({ name: z.string().max(80), score, comment: z.string().max(500) }))
    .min(1)
    .max(8),
  strengths: z.array(z.string().max(300)).max(8),
  improvements: z.array(z.string().max(300)).max(8),
  feedback: z.string().max(3000),
  /** A worked example the candidate can learn from, clearly labelled as a model answer. */
  exampleAnswer: z.string().max(1500).nullable(),
});
export type InterviewEvaluation = z.infer<typeof interviewEvaluationSchema>;

// ---------------------------------------------------------------------------
// analyzeApplication
// ---------------------------------------------------------------------------
export const applicationAnalysisSchema = z.object({
  summary: z.string().max(1200),
  alignment: z.array(z.object({ requirement: z.string().max(200), met: z.enum(['YES', 'PARTIAL', 'NO', 'UNKNOWN']), evidence: z.string().max(400) })).max(15),
  concerns: z.array(z.string().max(300)).max(8),
  suggestedQuestions: z.array(z.string().max(300)).max(6),
  /** Never a reject/accept verdict — the employer decides. */
  reviewPriority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
});
export type ApplicationAnalysis = z.infer<typeof applicationAnalysisSchema>;

// ---------------------------------------------------------------------------
// detectPotentialFraud
// ---------------------------------------------------------------------------
export const fraudSignalSchema = z.object({
  rule: z.string().max(120),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  explanation: z.string().max(500),
  evidence: z.string().max(600),
});

export const fraudAnalysisSchema = z.object({
  riskScore: score,
  signals: z.array(fraudSignalSchema).max(12),
  /** Always a review recommendation. The system never auto-bans on this. */
  recommendation: z.enum(['NO_ACTION', 'MONITOR', 'REVIEW', 'URGENT_REVIEW']),
  summary: z.string().max(800),
});
export type FraudAnalysis = z.infer<typeof fraudAnalysisSchema>;

// ---------------------------------------------------------------------------
// CV improvement / proposal drafting
// ---------------------------------------------------------------------------
export const cvImprovementSchema = z.object({
  /** Each suggestion rewrites text the worker already wrote. No new facts. */
  suggestions: z
    .array(
      z.object({
        section: z.string().max(120),
        original: z.string().max(1000),
        improved: z.string().max(1000),
        reason: z.string().max(400),
      }),
    )
    .max(15),
  missingSections: z.array(z.string().max(200)).max(8),
  generalAdvice: z.array(z.string().max(300)).max(8),
});
export type CvImprovement = z.infer<typeof cvImprovementSchema>;

export const proposalDraftSchema = z.object({
  proposal: z.string().max(3000),
  /** Every claim mapped to the profile fact that supports it. */
  claimsUsed: z.array(z.object({ claim: z.string().max(300), backedBy: z.string().max(300) })).max(10),
  /** Things the worker should add themselves — the model refuses to invent them. */
  gapsToAddress: z.array(z.string().max(300)).max(6),
});
export type ProposalDraft = z.infer<typeof proposalDraftSchema>;

// ---------------------------------------------------------------------------
// Career agent chat
// ---------------------------------------------------------------------------
export const agentReplySchema = z.object({
  reply: z.string().max(4000),
  suggestedActions: z
    .array(
      z.object({
        label: z.string().max(120),
        actionType: z.enum(['SIMULATION', 'PROFILE', 'PORTFOLIO', 'BROWSE_JOBS', 'BROWSE_TASKS', 'INTERVIEW_PRACTICE', 'CV']),
        href: z.string().max(300).nullable(),
      }),
    )
    .max(4),
});
export type AgentReply = z.infer<typeof agentReplySchema>;
