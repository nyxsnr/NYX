import { describe, expect, it } from 'vitest';
import { COMPONENT_WEIGHTS, computeReadiness, type ReadinessSnapshot } from '@/lib/readiness';

const emptyWorker: ReadinessSnapshot = {
  hasPhoto: false, hasHeadline: false, hasSummary: false, hasLocation: false,
  hasEducation: false, hasLanguages: false, hasDesiredIncome: false,
  hasWorkPreferences: false, hasCv: false, emailVerified: false, phoneVerified: false,
  skillCount: 0, verifiedSkillCount: 0, aiInferredSkillCount: 0, inDemandSkillCount: 0,
  simulationsCompleted: 0, bestSimulationScore: null, averageSimulationScore: null,
  portfolioItemCount: 0, verifiedPortfolioItemCount: 0,
  interviewsCompleted: 0, bestInterviewScore: null, writtenCommunicationScore: null,
  yearsExperience: 0, jobsCompleted: 0, tasksCompleted: 0,
  completionRate: null, onTimeRate: null, cancellationRate: null,
  averageEmployerRating: null, ratingCount: 0, averageQualityRating: null,
  responseRate: null, disputesLost: 0,
};

const provenWorker: ReadinessSnapshot = {
  ...emptyWorker,
  hasPhoto: true, hasHeadline: true, hasSummary: true, hasLocation: true,
  hasEducation: true, hasLanguages: true, hasDesiredIncome: true,
  hasWorkPreferences: true, hasCv: true, emailVerified: true, phoneVerified: true,
  skillCount: 8, verifiedSkillCount: 4, aiInferredSkillCount: 4, inDemandSkillCount: 5,
  simulationsCompleted: 3, bestSimulationScore: 86, averageSimulationScore: 78,
  portfolioItemCount: 4, verifiedPortfolioItemCount: 2,
  interviewsCompleted: 2, bestInterviewScore: 80, writtenCommunicationScore: 75,
  yearsExperience: 4, jobsCompleted: 1, tasksCompleted: 9,
  completionRate: 96, onTimeRate: 92, cancellationRate: 3,
  averageEmployerRating: 4.6, ratingCount: 8, averageQualityRating: 4.5,
  responseRate: 88, disputesLost: 0,
};

describe('work readiness score', () => {
  it('weights sum to exactly 1', () => {
    const total = Object.values(COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('stays within 0-100 at both extremes', () => {
    expect(computeReadiness(emptyWorker).score).toBeGreaterThanOrEqual(0);
    expect(computeReadiness(provenWorker).score).toBeLessThanOrEqual(100);
  });

  it('scores a proven worker far above an empty profile', () => {
    expect(computeReadiness(provenWorker).score).toBeGreaterThan(
      computeReadiness(emptyWorker).score + 40,
    );
  });

  it('is fully decomposable: components reproduce the total', () => {
    const result = computeReadiness(provenWorker);
    const recomputed = Math.round(
      result.components.reduce((acc, c) => acc + c.score * c.weight, 0),
    );
    expect(recomputed).toBe(result.score);
  });

  it('explains every component in plain language', () => {
    for (const component of computeReadiness(emptyWorker).components) {
      expect(component.explanation.length).toBeGreaterThan(20);
      expect(component.score).toBeGreaterThanOrEqual(0);
      expect(component.score).toBeLessThanOrEqual(100);
    }
  });

  it('does not punish a new worker for having no track record', () => {
    const result = computeReadiness(emptyWorker);
    const reliability = result.components.find((c) => c.key === 'reliability');
    const performance = result.components.find((c) => c.key === 'taskPerformance');
    // Neutral baseline, not zero.
    expect(reliability?.score).toBeGreaterThanOrEqual(50);
    expect(performance?.score).toBeGreaterThanOrEqual(50);
    expect(reliability?.confidence).toBe('LOW');
  });

  it('makes the first simulation the top recommendation for a new worker', () => {
    const { improvements } = computeReadiness(emptyWorker);
    expect(improvements.length).toBeGreaterThan(0);
    expect(improvements.some((i) => i.key === 'first_simulation')).toBe(true);
    for (const action of improvements) {
      expect(action.estimatedPoints).toBeGreaterThan(0);
      expect(action.href).toMatch(/^\/worker/);
    }
  });

  it('recommends nothing already done', () => {
    const { improvements } = computeReadiness(provenWorker);
    expect(improvements.some((i) => i.key === 'first_simulation')).toBe(false);
    expect(improvements.some((i) => i.key === 'upload_cv')).toBe(false);
  });

  it('rewards proof of work over self-reported breadth', () => {
    const claimer = { ...emptyWorker, skillCount: 12, inDemandSkillCount: 6 };
    const prover = { ...emptyWorker, skillCount: 3, verifiedSkillCount: 3, inDemandSkillCount: 2,
      simulationsCompleted: 2, bestSimulationScore: 82, averageSimulationScore: 76 };
    expect(computeReadiness(prover).score).toBeGreaterThan(computeReadiness(claimer).score);
  });

  it('bands increase monotonically with score', () => {
    const bands = ['GETTING_STARTED', 'BUILDING', 'WORK_READY', 'STRONG'];
    const emptyBand = bands.indexOf(computeReadiness(emptyWorker).band);
    const provenBand = bands.indexOf(computeReadiness(provenWorker).band);
    expect(provenBand).toBeGreaterThan(emptyBand);
  });
});
