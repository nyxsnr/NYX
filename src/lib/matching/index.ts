/**
 * Explainable matching engine.
 *
 * Scoring is feature-based and deterministic: each factor produces a 0-1
 * value, a weight and a sentence of English. The score is the weighted sum,
 * so every point can be traced to a named reason. Keyword overlap alone never
 * decides a match — evidence, logistics and stated preferences all carry
 * weight, and unverified claims are discounted against proven ones.
 *
 * The model's only role is to phrase the explanation. It cannot change the
 * score, and it never sees a protected characteristic.
 */
import { cosineSimilarity } from '@/lib/ai/embeddings';

export type MatchImpact = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface MatchReason {
  factor: string;
  impact: MatchImpact;
  weight: number;
  explanation: string;
}

export interface MatchResult {
  score: number;
  reasons: MatchReason[];
  gaps: string[];
  /** Advisory band. Employers always see the evidence, not just the band. */
  band: 'STRONG_FIT' | 'GOOD_FIT' | 'WORTH_REVIEWING' | 'WEAK_FIT';
  /** True when a hard requirement is unmet — surfaced, never used to auto-reject. */
  blockers: string[];
}

export type EvidenceLevel = 'SELF_REPORTED' | 'AI_INFERRED' | 'SIMULATION_VERIFIED' | 'EMPLOYER_VERIFIED';

/**
 * How much a claim is worth, by how it was established.
 *
 * A self-reported skill is worth roughly a third of a proven one. This single
 * table is what makes the platform reward doing the work over claiming it.
 */
export const EVIDENCE_MULTIPLIER: Record<EvidenceLevel, number> = {
  SELF_REPORTED: 0.35,
  AI_INFERRED: 0.55,
  SIMULATION_VERIFIED: 0.9,
  EMPLOYER_VERIFIED: 1.0,
};

const LEVEL_RANK = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3, EXPERT: 4 } as const;
export type SkillLevel = keyof typeof LEVEL_RANK;

export interface WorkerSkillSignal {
  skillSlug: string;
  level: SkillLevel | null;
  evidenceLevel: EvidenceLevel;
  /** Best simulation score in this skill, if any. */
  simulationScore?: number | null;
}

export interface WorkerMatchProfile {
  skills: WorkerSkillSignal[];
  yearsExperience: number;
  educationLevel: string | null;
  regionId: string | null;
  regionName?: string | null;
  workArrangement: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY';
  preferredWorkTypes: string[];
  desiredIncomeMin: number | null;
  desiredIncomeMax: number | null;
  incomePeriod: string;
  languages: string[];
  hasLaptop: boolean;
  internetAccess: 'NONE' | 'OCCASIONAL' | 'MOBILE_DATA' | 'BROADBAND';
  isAvailable: boolean;
  hoursPerWeek: number | null;
  completionRate: number | null;
  averageRating: number | null;
  ratingCount: number;
  tasksCompleted: number;
  readinessScore: number;
  embedding?: number[] | null;
}

export interface OpportunityRequirements {
  kind: 'JOB' | 'TASK';
  requiredSkills: Array<{ skillSlug: string; minLevel?: SkillLevel | null; weight?: number }>;
  preferredSkills: Array<{ skillSlug: string; weight?: number }>;
  minYearsExperience: number;
  minEducation: string | null;
  regionId: string | null;
  regionName?: string | null;
  workArrangement: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'ANY';
  employmentType: string | null;
  /** Monthly-equivalent minor units for jobs; total budget for tasks. */
  payMin: number | null;
  payMax: number | null;
  payPeriod: string;
  languagesRequired: string[];
  requiresLaptop: boolean;
  requiresLocation: boolean;
  embedding?: number[] | null;
}

const EDUCATION_RANK: Record<string, number> = {
  NONE: 0, PRIMARY: 1, SECONDARY: 2, CERTIFICATE: 3, DIPLOMA: 4, BACHELORS: 5, MASTERS: 6, DOCTORATE: 7,
};

/** Factor weights. Required-skill coverage dominates, as it should. */
const WEIGHTS = {
  requiredSkills: 0.32,
  evidenceQuality: 0.14,
  preferredSkills: 0.08,
  experience: 0.11,
  location: 0.1,
  arrangement: 0.06,
  compensation: 0.08,
  equipment: 0.04,
  language: 0.03,
  trackRecord: 0.04,
} as const;

/** Effective strength of a worker's claim on one skill, in 0-1. */
function skillStrength(signal: WorkerSkillSignal, minLevel?: SkillLevel | null): number {
  const evidence = EVIDENCE_MULTIPLIER[signal.evidenceLevel];
  const level = signal.level ? LEVEL_RANK[signal.level] : 1;
  const required = minLevel ? LEVEL_RANK[minLevel] : 1;

  // Meeting the level bar is what matters; exceeding it adds a little.
  const levelFit = level >= required ? 1 : Math.max(0.25, level / required);

  // A strong simulation score in this exact skill is the best evidence there is.
  const simulationBoost =
    signal.simulationScore != null ? Math.min(0.15, (signal.simulationScore - 60) / 300) : 0;

  return Math.max(0, Math.min(1, evidence * levelFit + simulationBoost));
}

export function computeMatch(
  worker: WorkerMatchProfile,
  opportunity: OpportunityRequirements,
): MatchResult {
  const reasons: MatchReason[] = [];
  const gaps: string[] = [];
  const blockers: string[] = [];
  const skillMap = new Map(worker.skills.map((s) => [s.skillSlug, s]));

  // --- Required skills ------------------------------------------------------
  let requiredScore = 1;
  if (opportunity.requiredSkills.length > 0) {
    const totalWeight = opportunity.requiredSkills.reduce((acc, s) => acc + (s.weight ?? 1), 0);
    let earned = 0;
    const met: string[] = [];
    const missing: string[] = [];

    for (const required of opportunity.requiredSkills) {
      const signal = skillMap.get(required.skillSlug);
      const weight = required.weight ?? 1;
      if (!signal) {
        missing.push(required.skillSlug);
        continue;
      }
      const strength = skillStrength(signal, required.minLevel);
      earned += strength * weight;
      if (strength >= 0.5) met.push(required.skillSlug); else missing.push(required.skillSlug);
    }

    requiredScore = totalWeight > 0 ? earned / totalWeight : 1;

    reasons.push({
      factor: 'Required skills',
      impact: requiredScore >= 0.6 ? 'POSITIVE' : requiredScore >= 0.3 ? 'NEUTRAL' : 'NEGATIVE',
      weight: WEIGHTS.requiredSkills,
      explanation: met.length
        ? `Evidences ${met.length} of ${opportunity.requiredSkills.length} required skill(s): ${met.map(humanise).join(', ')}.`
        : 'None of the required skills are evidenced on this profile.',
    });

    if (missing.length) {
      gaps.push(`No evidence for: ${missing.map(humanise).join(', ')}.`);
      if (missing.length === opportunity.requiredSkills.length) {
        blockers.push('None of the required skills are evidenced.');
      }
    }
  }

  // --- Evidence quality -----------------------------------------------------
  const relevantSlugs = new Set(opportunity.requiredSkills.map((s) => s.skillSlug));
  const relevant = worker.skills.filter((s) => relevantSlugs.has(s.skillSlug));
  const verified = relevant.filter(
    (s) => s.evidenceLevel === 'SIMULATION_VERIFIED' || s.evidenceLevel === 'EMPLOYER_VERIFIED',
  );
  const evidenceScore = relevant.length ? verified.length / relevant.length : 0;

  reasons.push({
    factor: 'Evidence quality',
    impact: verified.length > 0 ? 'POSITIVE' : 'NEUTRAL',
    weight: WEIGHTS.evidenceQuality,
    explanation: verified.length
      ? `${verified.length} relevant skill(s) are simulation- or employer-verified, not just claimed: ${verified.map((s) => humanise(s.skillSlug)).join(', ')}.`
      : 'Relevant skills on this profile are self-reported or AI-inferred, not yet proven through work.',
  });
  if (verified.length === 0 && opportunity.requiredSkills.length > 0) {
    gaps.push('No verified evidence for the required skills yet.');
  }

  // --- Preferred skills -----------------------------------------------------
  let preferredScore = 0.5;
  if (opportunity.preferredSkills.length > 0) {
    const totalWeight = opportunity.preferredSkills.reduce((acc, s) => acc + (s.weight ?? 1), 0);
    let earned = 0;
    const met: string[] = [];
    for (const pref of opportunity.preferredSkills) {
      const signal = skillMap.get(pref.skillSlug);
      if (signal) {
        earned += skillStrength(signal) * (pref.weight ?? 1);
        met.push(pref.skillSlug);
      }
    }
    preferredScore = totalWeight > 0 ? earned / totalWeight : 0.5;
    if (met.length) {
      reasons.push({
        factor: 'Preferred skills',
        impact: 'POSITIVE',
        weight: WEIGHTS.preferredSkills,
        explanation: `Also brings ${met.map(humanise).join(', ')}, which the employer listed as preferred.`,
      });
    }
  }

  // --- Experience -----------------------------------------------------------
  let experienceScore = 1;
  if (opportunity.minYearsExperience > 0) {
    const ratio = worker.yearsExperience / opportunity.minYearsExperience;
    // Platform delivery partially substitutes for years, which matters for
    // people whose real experience is informal and undocumented.
    const platformCredit = Math.min(0.3, worker.tasksCompleted * 0.05);
    experienceScore = Math.max(0, Math.min(1, ratio + platformCredit));

    reasons.push({
      factor: 'Experience',
      impact: experienceScore >= 0.9 ? 'POSITIVE' : experienceScore >= 0.5 ? 'NEUTRAL' : 'NEGATIVE',
      weight: WEIGHTS.experience,
      explanation:
        experienceScore >= 1
          ? `${worker.yearsExperience} year(s) of experience meets the ${opportunity.minYearsExperience}-year requirement.`
          : `${worker.yearsExperience} year(s) against a ${opportunity.minYearsExperience}-year requirement${worker.tasksCompleted > 0 ? `, partly offset by ${worker.tasksCompleted} completed task(s) on KaziOS` : ''}.`,
    });
    if (experienceScore < 0.5) {
      gaps.push(`Below the stated experience requirement (${opportunity.minYearsExperience} years).`);
    }
  }

  // Education is a gate only where the employer set one, and never overrides
  // demonstrated capability — it contributes through the experience factor.
  if (opportunity.minEducation && worker.educationLevel) {
    const required = EDUCATION_RANK[opportunity.minEducation] ?? 0;
    const held = EDUCATION_RANK[worker.educationLevel] ?? 0;
    if (held < required) {
      gaps.push(`Education is below the stated minimum (${humanise(opportunity.minEducation)}).`);
      experienceScore *= 0.85;
    }
  }

  // --- Location -------------------------------------------------------------
  let locationScore = 1;
  const isRemote = opportunity.workArrangement === 'REMOTE';
  if (isRemote || !opportunity.requiresLocation) {
    locationScore = 1;
    reasons.push({
      factor: 'Location',
      impact: 'POSITIVE',
      weight: WEIGHTS.location,
      explanation: isRemote ? 'This is remote work, so location is not a constraint.' : 'No location restriction on this work.',
    });
  } else if (opportunity.regionId && worker.regionId) {
    const sameRegion = opportunity.regionId === worker.regionId;
    locationScore = sameRegion ? 1 : 0.25;
    reasons.push({
      factor: 'Location',
      impact: sameRegion ? 'POSITIVE' : 'NEGATIVE',
      weight: WEIGHTS.location,
      explanation: sameRegion
        ? `Based in ${opportunity.regionName ?? 'the same county'} as this role.`
        : `Based in ${worker.regionName ?? 'a different county'}; this role is in ${opportunity.regionName ?? 'another county'}.`,
    });
    if (!sameRegion) gaps.push('Not currently based in the county where this work is located.');
  } else {
    locationScore = 0.6;
  }

  // --- Work arrangement -----------------------------------------------------
  let arrangementScore = 1;
  if (worker.workArrangement !== 'ANY' && opportunity.workArrangement !== 'ANY') {
    const compatible =
      worker.workArrangement === opportunity.workArrangement ||
      (worker.workArrangement === 'HYBRID' && opportunity.workArrangement !== 'REMOTE') ||
      (opportunity.workArrangement === 'HYBRID' && worker.workArrangement !== 'REMOTE');
    arrangementScore = compatible ? 1 : 0.3;
    reasons.push({
      factor: 'Work arrangement',
      impact: compatible ? 'POSITIVE' : 'NEGATIVE',
      weight: WEIGHTS.arrangement,
      explanation: compatible
        ? `Prefers ${humanise(worker.workArrangement)} work, which fits this ${humanise(opportunity.workArrangement)} role.`
        : `Prefers ${humanise(worker.workArrangement)} work; this role is ${humanise(opportunity.workArrangement)}.`,
    });
    if (!compatible) gaps.push('Stated work-arrangement preference does not match this role.');
  }

  // Employment type: a worker looking for full-time may not want a gig.
  if (opportunity.employmentType && worker.preferredWorkTypes.length > 0) {
    if (!worker.preferredWorkTypes.includes(opportunity.employmentType)) {
      arrangementScore *= 0.7;
      gaps.push(`Has not listed ${humanise(opportunity.employmentType)} among preferred work types.`);
    }
  }

  // --- Compensation ---------------------------------------------------------
  let compensationScore = 0.7;
  if (opportunity.payMax !== null && worker.desiredIncomeMin !== null) {
    // Comparable only when periods align; otherwise stay neutral rather than
    // inventing a conversion that would mislead both sides.
    const comparable = opportunity.payPeriod === worker.incomePeriod || opportunity.kind === 'TASK';
    if (comparable) {
      if (opportunity.payMax >= worker.desiredIncomeMin) {
        compensationScore = 1;
        reasons.push({
          factor: 'Pay expectations',
          impact: 'POSITIVE',
          weight: WEIGHTS.compensation,
          explanation: 'The offered pay meets or exceeds this person’s stated expectation.',
        });
      } else {
        const ratio = opportunity.payMax / Math.max(1, worker.desiredIncomeMin);
        compensationScore = Math.max(0.1, ratio);
        reasons.push({
          factor: 'Pay expectations',
          impact: 'NEGATIVE',
          weight: WEIGHTS.compensation,
          explanation: 'The offered pay is below this person’s stated expectation, so they may decline.',
        });
        gaps.push('Offered pay is below the stated income expectation.');
      }
    }
  }

  // --- Equipment ------------------------------------------------------------
  let equipmentScore = 1;
  if (opportunity.requiresLaptop) {
    equipmentScore = worker.hasLaptop ? 1 : 0.15;
    reasons.push({
      factor: 'Equipment',
      impact: worker.hasLaptop ? 'POSITIVE' : 'NEGATIVE',
      weight: WEIGHTS.equipment,
      explanation: worker.hasLaptop
        ? 'Has laptop access, which this work requires.'
        : 'This work requires a laptop, which this person has not indicated they have.',
    });
    if (!worker.hasLaptop) blockers.push('This work requires a laptop.');
  }
  if (isRemote && (worker.internetAccess === 'NONE' || worker.internetAccess === 'OCCASIONAL')) {
    equipmentScore *= 0.5;
    gaps.push('Limited internet access may make consistent remote work difficult.');
  }

  // --- Language -------------------------------------------------------------
  let languageScore = 1;
  if (opportunity.languagesRequired.length > 0) {
    const held = new Set(worker.languages.map((l) => l.toLowerCase()));
    const met = opportunity.languagesRequired.filter((l) => held.has(l.toLowerCase()));
    languageScore = met.length / opportunity.languagesRequired.length;
    if (languageScore < 1) {
      gaps.push(`Has not listed: ${opportunity.languagesRequired.filter((l) => !held.has(l.toLowerCase())).join(', ')}.`);
    }
  }

  // --- Track record ---------------------------------------------------------
  // Only counted once there is enough of it to be fair (see reputation module).
  let trackRecordScore = 0.6;
  if (worker.ratingCount >= 3 && worker.averageRating !== null) {
    trackRecordScore = Math.min(1, worker.averageRating / 5 + 0.1);
    reasons.push({
      factor: 'Track record',
      impact: worker.averageRating >= 4 ? 'POSITIVE' : worker.averageRating >= 3 ? 'NEUTRAL' : 'NEGATIVE',
      weight: WEIGHTS.trackRecord,
      explanation: `Rated ${worker.averageRating.toFixed(1)}/5 across ${worker.ratingCount} completed piece(s) of work.`,
    });
  } else if (worker.tasksCompleted > 0) {
    reasons.push({
      factor: 'Track record',
      impact: 'NEUTRAL',
      weight: WEIGHTS.trackRecord,
      explanation: `${worker.tasksCompleted} completed task(s), not yet enough ratings to draw a conclusion.`,
    });
  }

  // --- Availability ---------------------------------------------------------
  if (!worker.isAvailable) {
    gaps.push('Currently marked as unavailable for new work.');
  }

  // --- Weighted total -------------------------------------------------------
  let score =
    requiredScore * WEIGHTS.requiredSkills +
    evidenceScore * WEIGHTS.evidenceQuality +
    preferredScore * WEIGHTS.preferredSkills +
    experienceScore * WEIGHTS.experience +
    locationScore * WEIGHTS.location +
    arrangementScore * WEIGHTS.arrangement +
    compensationScore * WEIGHTS.compensation +
    equipmentScore * WEIGHTS.equipment +
    languageScore * WEIGHTS.language +
    trackRecordScore * WEIGHTS.trackRecord;

  // Semantic similarity is a tie-breaker only: it can move a match by a few
  // points, never carry one. Lexical overlap is not evidence of capability.
  if (worker.embedding?.length && opportunity.embedding?.length) {
    const similarity = cosineSimilarity(worker.embedding, opportunity.embedding);
    if (similarity > 0.15) {
      score += Math.min(0.05, similarity * 0.06);
      reasons.push({
        factor: 'Profile relevance',
        impact: 'POSITIVE',
        weight: 0.05,
        explanation: 'Profile wording overlaps meaningfully with this posting.',
      });
    }
  }

  if (!worker.isAvailable) score *= 0.75;

  const finalScore = Math.round(Math.max(0, Math.min(1, score)) * 100);

  return {
    score: finalScore,
    reasons: reasons.sort((a, b) => b.weight - a.weight).slice(0, 12),
    gaps: gaps.slice(0, 8),
    band:
      finalScore >= 80 ? 'STRONG_FIT' : finalScore >= 65 ? 'GOOD_FIT' : finalScore >= 45 ? 'WORTH_REVIEWING' : 'WEAK_FIT',
    blockers,
  };
}

/** "customer-support" -> "customer support"; "FULL_TIME" -> "full time". */
export function humanise(slug: string): string {
  return slug.replace(/[-_]/g, ' ').toLowerCase();
}

/**
 * Rank many candidates against one opportunity.
 * Returns every candidate with a score — filtering is the caller's decision,
 * so nobody is silently removed from an employer's view by an opaque cutoff.
 */
export function rankCandidates<T extends { profile: WorkerMatchProfile }>(
  candidates: T[],
  opportunity: OpportunityRequirements,
): Array<T & { match: MatchResult }> {
  return candidates
    .map((c) => ({ ...c, match: computeMatch(c.profile, opportunity) }))
    .sort((a, b) => b.match.score - a.match.score);
}

/** Rank many opportunities for one worker. */
export function rankOpportunities<T extends { requirements: OpportunityRequirements }>(
  opportunities: T[],
  worker: WorkerMatchProfile,
): Array<T & { match: MatchResult }> {
  return opportunities
    .map((o) => ({ ...o, match: computeMatch(worker, o.requirements) }))
    .sort((a, b) => b.match.score - a.match.score);
}
