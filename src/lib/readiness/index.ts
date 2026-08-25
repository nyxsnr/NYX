/**
 * Work Readiness Score.
 *
 * A transparent 0-100 score. Deliberately NOT a black box: every component is
 * computed by a documented rule from a named input, and the engine returns the
 * exact actions that would raise it, with the points each is worth.
 *
 * The score is a pure function of a snapshot, so it can be unit-tested,
 * explained to a user line by line, and recomputed identically at any time.
 * Nothing here consults a model.
 */

export type ReadinessComponentKey =
  | 'skillFit'
  | 'proofOfWork'
  | 'communication'
  | 'reliability'
  | 'experience'
  | 'taskPerformance'
  | 'profileCompleteness';

/**
 * Weights sum to 1.0.
 *
 * Proof of work carries the most weight because demonstrated ability is the
 * product's entire premise. Reliability and task performance are weighted
 * below the others until a worker has history, via the confidence rules in
 * `component()` — an unproven worker is not punished for having no record.
 */
export const COMPONENT_WEIGHTS: Record<ReadinessComponentKey, number> = {
  proofOfWork: 0.26,
  skillFit: 0.18,
  communication: 0.14,
  reliability: 0.14,
  experience: 0.12,
  taskPerformance: 0.1,
  profileCompleteness: 0.06,
};

export const COMPONENT_LABELS: Record<ReadinessComponentKey, string> = {
  proofOfWork: 'Proof of work',
  skillFit: 'Skill fit',
  communication: 'Communication',
  reliability: 'Reliability',
  experience: 'Experience',
  taskPerformance: 'Task performance',
  profileCompleteness: 'Profile completeness',
};

/** Everything the score is computed from. */
export interface ReadinessSnapshot {
  // Profile
  hasPhoto: boolean;
  hasHeadline: boolean;
  hasSummary: boolean;
  hasLocation: boolean;
  hasEducation: boolean;
  hasLanguages: boolean;
  hasDesiredIncome: boolean;
  hasWorkPreferences: boolean;
  hasCv: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;

  // Capability
  skillCount: number;
  verifiedSkillCount: number;      // SIMULATION_VERIFIED or EMPLOYER_VERIFIED
  aiInferredSkillCount: number;
  /** Demand-weighted: how many of this worker's skills employers are asking for. */
  inDemandSkillCount: number;

  // Proof
  simulationsCompleted: number;
  bestSimulationScore: number | null;
  averageSimulationScore: number | null;
  portfolioItemCount: number;
  verifiedPortfolioItemCount: number;

  // Communication
  interviewsCompleted: number;
  bestInterviewScore: number | null;
  /** Best available written-communication signal, 0-100. */
  writtenCommunicationScore: number | null;

  // Track record
  yearsExperience: number;
  jobsCompleted: number;
  tasksCompleted: number;
  completionRate: number | null;     // 0-100
  onTimeRate: number | null;         // 0-100
  cancellationRate: number | null;   // 0-100
  averageEmployerRating: number | null; // 0-5
  ratingCount: number;
  averageQualityRating: number | null;  // 0-5
  responseRate: number | null;       // 0-100
  disputesLost: number;
}

export interface ReadinessComponent {
  key: ReadinessComponentKey;
  label: string;
  score: number;
  weight: number;
  /** Weighted contribution to the overall score, rounded for display. */
  contribution: number;
  /** How much of the input this score is based on. Low = provisional. */
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Plain-English explanation shown directly to the worker. */
  explanation: string;
}

export interface ImprovementAction {
  key: string;
  title: string;
  description: string;
  /** Realistic point gain on the overall score. Never overstated. */
  estimatedPoints: number;
  component: ReadinessComponentKey;
  actionType: 'SIMULATION' | 'PROFILE' | 'PORTFOLIO' | 'VERIFY' | 'INTERVIEW' | 'WORK' | 'CV';
  href: string;
}

export interface ReadinessResult {
  score: number;
  components: ReadinessComponent[];
  improvements: ImprovementAction[];
  /** Band used for UI copy. Never shown as a pass/fail. */
  band: 'GETTING_STARTED' | 'BUILDING' | 'WORK_READY' | 'STRONG';
  computedAt: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Sufficient-data rule.
 *
 * With few data points, a component is pulled toward a neutral baseline rather
 * than swinging on one event. This is what stops a single bad review — or a
 * single lucky one — from defining someone.
 */
function withConfidence(rawScore: number, observations: number, threshold: number, baseline = 55) {
  const confidence: ReadinessComponent['confidence'] =
    observations >= threshold ? 'HIGH' : observations >= Math.ceil(threshold / 2) ? 'MEDIUM' : 'LOW';
  if (observations === 0) return { score: baseline, confidence: 'LOW' as const };
  const trust = Math.min(1, observations / threshold);
  return { score: clamp(baseline + (rawScore - baseline) * trust), confidence };
}

function computeProfileCompleteness(s: ReadinessSnapshot) {
  const checks: Array<[boolean, number]> = [
    [s.hasHeadline, 12],
    [s.hasSummary, 16],
    [s.hasLocation, 10],
    [s.hasEducation, 8],
    [s.hasLanguages, 6],
    [s.hasDesiredIncome, 8],
    [s.hasWorkPreferences, 10],
    [s.hasPhoto, 8],
    [s.hasCv, 12],
    [s.emailVerified, 6],
    [s.phoneVerified, 4],
  ];
  const total = checks.reduce((acc, [, w]) => acc + w, 0);
  const earned = checks.reduce((acc, [met, w]) => acc + (met ? w : 0), 0);
  return clamp((earned / total) * 100);
}

function computeProofOfWork(s: ReadinessSnapshot) {
  // A completed simulation is worth far more than a self-declared skill.
  const simulationSignal =
    s.simulationsCompleted === 0
      ? 0
      : clamp(
          (s.bestSimulationScore ?? 0) * 0.6 +
            (s.averageSimulationScore ?? 0) * 0.2 +
            Math.min(3, s.simulationsCompleted) * 6,
        );

  const portfolioSignal = clamp(
    Math.min(4, s.portfolioItemCount) * 8 + Math.min(3, s.verifiedPortfolioItemCount) * 10,
  );

  const verifiedSkillSignal = clamp(Math.min(6, s.verifiedSkillCount) * 12);

  // Weighted so a worker can reach a good score through more than one route.
  return clamp(simulationSignal * 0.55 + verifiedSkillSignal * 0.25 + portfolioSignal * 0.2);
}

function computeSkillFit(s: ReadinessSnapshot) {
  const breadth = clamp(Math.min(10, s.skillCount) * 7);
  const demand = clamp(Math.min(6, s.inDemandSkillCount) * 14);
  const quality = clamp(
    s.skillCount === 0 ? 0 : (s.verifiedSkillCount / Math.max(1, s.skillCount)) * 100,
  );
  return clamp(breadth * 0.35 + demand * 0.4 + quality * 0.25);
}

function computeCommunication(s: ReadinessSnapshot) {
  const signals: number[] = [];
  if (s.bestInterviewScore !== null) signals.push(s.bestInterviewScore);
  if (s.writtenCommunicationScore !== null) signals.push(s.writtenCommunicationScore);
  if (s.hasSummary) signals.push(65);
  if (s.responseRate !== null) signals.push(s.responseRate);
  if (signals.length === 0) return { raw: 0, observations: 0 };
  return {
    raw: signals.reduce((a, b) => a + b, 0) / signals.length,
    observations: signals.length,
  };
}

function computeReliability(s: ReadinessSnapshot) {
  const observations = s.jobsCompleted + s.tasksCompleted;
  if (observations === 0) return { raw: 0, observations: 0 };

  const completion = s.completionRate ?? 100;
  const onTime = s.onTimeRate ?? 80;
  const cancellation = s.cancellationRate ?? 0;
  const responsiveness = s.responseRate ?? 70;

  const raw =
    completion * 0.35 + onTime * 0.3 + responsiveness * 0.2 + clamp(100 - cancellation * 2) * 0.15;

  // A lost dispute is a real signal, but it is bounded so it cannot erase a
  // long good record.
  return { raw: clamp(raw - Math.min(20, s.disputesLost * 10)), observations };
}

function computeTaskPerformance(s: ReadinessSnapshot) {
  const observations = s.ratingCount;
  if (observations === 0) return { raw: 0, observations: 0 };
  const rating = ((s.averageEmployerRating ?? 0) / 5) * 100;
  const quality = s.averageQualityRating !== null ? (s.averageQualityRating / 5) * 100 : rating;
  return { raw: clamp(rating * 0.55 + quality * 0.45), observations };
}

function computeExperience(s: ReadinessSnapshot) {
  // Years matter, with diminishing returns; platform work counts too, because
  // for many users on this platform it is the only formal record they have.
  const years = clamp(Math.min(10, s.yearsExperience) * 8);
  const platform = clamp(Math.min(10, s.jobsCompleted * 3 + s.tasksCompleted) * 6);
  return clamp(Math.max(years, platform * 0.9) * 0.75 + Math.min(years, platform) * 0.25);
}

/** Compute the full readiness result. Pure — no I/O, no clock beyond the stamp. */
export function computeReadiness(s: ReadinessSnapshot, now = new Date()): ReadinessResult {
  const profileCompleteness = computeProfileCompleteness(s);
  const proofOfWork = computeProofOfWork(s);
  const skillFit = computeSkillFit(s);
  const experience = computeExperience(s);

  const comm = computeCommunication(s);
  const rel = computeReliability(s);
  const perf = computeTaskPerformance(s);

  const communication = withConfidence(comm.raw, comm.observations, 3, 45);
  const reliability = withConfidence(rel.raw, rel.observations, 5, 60);
  const taskPerformance = withConfidence(perf.raw, perf.observations, 4, 60);

  const raw: Record<ReadinessComponentKey, { score: number; confidence: ReadinessComponent['confidence']; explanation: string }> = {
    proofOfWork: {
      score: proofOfWork,
      confidence: s.simulationsCompleted >= 2 ? 'HIGH' : s.simulationsCompleted >= 1 ? 'MEDIUM' : 'LOW',
      explanation:
        s.simulationsCompleted === 0
          ? 'You have not completed a work simulation yet. This is the fastest way to turn what you can do into evidence employers trust.'
          : `Based on ${s.simulationsCompleted} completed simulation(s) (best score ${s.bestSimulationScore ?? 0}), ${s.verifiedSkillCount} verified skill(s) and ${s.portfolioItemCount} portfolio item(s).`,
    },
    skillFit: {
      score: skillFit,
      confidence: s.skillCount >= 5 ? 'HIGH' : s.skillCount >= 2 ? 'MEDIUM' : 'LOW',
      explanation: `You have ${s.skillCount} skill(s) on your profile, ${s.inDemandSkillCount} of which employers are actively hiring for, and ${s.verifiedSkillCount} that are verified.`,
    },
    communication: {
      score: communication.score,
      confidence: communication.confidence,
      explanation:
        comm.observations === 0
          ? 'We have no communication signal yet. Complete an interview practice session or write your professional summary.'
          : `Based on ${comm.observations} signal(s) including your written profile${s.bestInterviewScore !== null ? ` and an interview practice score of ${s.bestInterviewScore}` : ''}.`,
    },
    reliability: {
      score: reliability.score,
      confidence: reliability.confidence,
      explanation:
        rel.observations === 0
          ? 'You have no completed work on KaziOS yet, so this starts at a neutral baseline. It is not counting against you.'
          : `Based on ${rel.observations} completed piece(s) of work: ${Math.round(s.completionRate ?? 100)}% completion, ${Math.round(s.onTimeRate ?? 0)}% delivered on time.`,
    },
    experience: {
      score: experience,
      confidence: s.yearsExperience > 0 || s.tasksCompleted > 0 ? 'MEDIUM' : 'LOW',
      explanation: `Based on ${s.yearsExperience} year(s) of stated experience and ${s.jobsCompleted + s.tasksCompleted} completed piece(s) of work on KaziOS.`,
    },
    taskPerformance: {
      score: taskPerformance.score,
      confidence: taskPerformance.confidence,
      explanation:
        perf.observations === 0
          ? 'No employer ratings yet. This starts at a neutral baseline and will not count against you until you have enough ratings to be fair.'
          : `Based on ${perf.observations} employer rating(s), averaging ${(s.averageEmployerRating ?? 0).toFixed(1)} out of 5.`,
    },
    profileCompleteness: {
      score: profileCompleteness,
      confidence: 'HIGH',
      explanation: `Your profile is ${Math.round(profileCompleteness)}% complete. Employers filter on these fields, so gaps quietly remove you from searches.`,
    },
  };

  const components: ReadinessComponent[] = (Object.keys(COMPONENT_WEIGHTS) as ReadinessComponentKey[])
    .map((key) => {
      const weight = COMPONENT_WEIGHTS[key];
      const score = Math.round(raw[key].score);
      return {
        key,
        label: COMPONENT_LABELS[key],
        score,
        weight,
        contribution: round(score * weight),
        confidence: raw[key].confidence,
        explanation: raw[key].explanation,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const score = Math.round(components.reduce((acc, c) => acc + c.score * c.weight, 0));

  return {
    score,
    components,
    improvements: buildImprovements(s, raw, score),
    band: score >= 80 ? 'STRONG' : score >= 60 ? 'WORK_READY' : score >= 35 ? 'BUILDING' : 'GETTING_STARTED',
    computedAt: now.toISOString(),
  };
}

/**
 * The "improve your score" list.
 *
 * Point estimates are derived from the same weights the score uses, so the
 * numbers shown to a worker are honest rather than motivational.
 */
function buildImprovements(
  s: ReadinessSnapshot,
  raw: Record<ReadinessComponentKey, { score: number }>,
  _currentScore: number,
): ImprovementAction[] {
  const actions: ImprovementAction[] = [];
  const gain = (key: ReadinessComponentKey, componentDelta: number) =>
    Math.max(1, Math.round(componentDelta * COMPONENT_WEIGHTS[key]));

  if (s.simulationsCompleted === 0) {
    actions.push({
      key: 'first_simulation',
      title: 'Complete your first work simulation',
      description:
        'A scored simulation converts a claim into evidence. It takes about 20 minutes and is the single biggest lever on your score.',
      estimatedPoints: gain('proofOfWork', 65 - raw.proofOfWork.score),
      component: 'proofOfWork',
      actionType: 'SIMULATION',
      href: '/worker/simulations',
    });
  } else if (s.simulationsCompleted < 3) {
    actions.push({
      key: 'more_simulations',
      title: `Complete ${3 - s.simulationsCompleted} more simulation(s)`,
      description:
        'Evidence across more than one type of work widens the roles you match, and raises your proof-of-work score.',
      estimatedPoints: gain('proofOfWork', 18),
      component: 'proofOfWork',
      actionType: 'SIMULATION',
      href: '/worker/simulations',
    });
  } else if ((s.bestSimulationScore ?? 0) < 70) {
    actions.push({
      key: 'improve_simulation',
      title: 'Re-take your strongest simulation',
      description:
        'Your best score is below the level most employers look for. Only your best attempt counts, so a re-take can only help.',
      estimatedPoints: gain('proofOfWork', 70 - (s.bestSimulationScore ?? 0)),
      component: 'proofOfWork',
      actionType: 'SIMULATION',
      href: '/worker/simulations',
    });
  }

  if (s.portfolioItemCount < 2) {
    actions.push({
      key: 'portfolio',
      title: 'Add work to your portfolio',
      description:
        'Add two examples of real work — paid or not. Describe what you did and what changed as a result.',
      estimatedPoints: gain('proofOfWork', 16),
      component: 'proofOfWork',
      actionType: 'PORTFOLIO',
      href: '/worker/portfolio',
    });
  }

  if (raw.profileCompleteness.score < 90) {
    const missing: string[] = [];
    if (!s.hasSummary) missing.push('a professional summary');
    if (!s.hasHeadline) missing.push('a headline');
    if (!s.hasCv) missing.push('your CV');
    if (!s.hasPhoto) missing.push('a profile photo');
    if (!s.hasDesiredIncome) missing.push('your income expectations');
    if (!s.hasWorkPreferences) missing.push('your work preferences');
    if (!s.hasLocation) missing.push('your location');

    actions.push({
      key: 'complete_profile',
      title: 'Complete your profile',
      description: missing.length
        ? `Still missing: ${missing.slice(0, 4).join(', ')}. Employers filter on these, so gaps remove you from searches without telling you.`
        : 'Fill in the remaining profile fields.',
      estimatedPoints: gain('profileCompleteness', 100 - raw.profileCompleteness.score),
      component: 'profileCompleteness',
      actionType: 'PROFILE',
      href: '/worker/profile',
    });
  }

  if (s.interviewsCompleted === 0) {
    actions.push({
      key: 'interview_practice',
      title: 'Practise an interview',
      description:
        'A scored practice interview gives you a communication signal on your profile and specific feedback before a real one.',
      estimatedPoints: gain('communication', 60 - raw.communication.score),
      component: 'communication',
      actionType: 'INTERVIEW',
      href: '/worker/interview',
    });
  }

  if (!s.emailVerified || !s.phoneVerified) {
    actions.push({
      key: 'verify_contact',
      title: `Verify your ${!s.emailVerified ? 'email address' : 'phone number'}`,
      description: 'Verified accounts are trusted more by employers and are required before you can be paid.',
      estimatedPoints: gain('profileCompleteness', 10),
      component: 'profileCompleteness',
      actionType: 'VERIFY',
      href: '/worker/profile',
    });
  }

  if (s.tasksCompleted === 0 && s.simulationsCompleted > 0) {
    actions.push({
      key: 'first_task',
      title: 'Take your first paid task',
      description:
        'A completed task builds your reliability and task-performance record, which currently sit at a neutral baseline.',
      estimatedPoints: gain('reliability', 20) + gain('taskPerformance', 15),
      component: 'reliability',
      actionType: 'WORK',
      href: '/worker/tasks',
    });
  }

  if (!s.hasCv) {
    actions.push({
      key: 'upload_cv',
      title: 'Upload your CV',
      description: 'We will extract your skills and experience automatically, and show you exactly what we read.',
      estimatedPoints: gain('skillFit', 14) + gain('profileCompleteness', 12),
      component: 'skillFit',
      actionType: 'CV',
      href: '/worker/cv',
    });
  }

  // Highest-value first, capped so the list stays actionable.
  return actions.sort((a, b) => b.estimatedPoints - a.estimatedPoints).slice(0, 6);
}
