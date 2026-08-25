import { describe, expect, it } from 'vitest';
import {
  computeMatch,
  EVIDENCE_MULTIPLIER,
  rankCandidates,
  type OpportunityRequirements,
  type WorkerMatchProfile,
} from '@/lib/matching';

const baseWorker: WorkerMatchProfile = {
  skills: [],
  yearsExperience: 2,
  educationLevel: 'DIPLOMA',
  regionId: 'region-nairobi',
  regionName: 'Nairobi',
  workArrangement: 'ANY',
  preferredWorkTypes: [],
  desiredIncomeMin: null,
  desiredIncomeMax: null,
  incomePeriod: 'MONTHLY',
  languages: ['en', 'sw'],
  hasLaptop: true,
  internetAccess: 'BROADBAND',
  isAvailable: true,
  hoursPerWeek: 40,
  completionRate: null,
  averageRating: null,
  ratingCount: 0,
  tasksCompleted: 0,
  readinessScore: 50,
};

const baseJob: OpportunityRequirements = {
  kind: 'JOB',
  requiredSkills: [{ skillSlug: 'excel' }, { skillSlug: 'data-entry-cleaning' }],
  preferredSkills: [],
  minYearsExperience: 0,
  minEducation: null,
  regionId: 'region-nairobi',
  regionName: 'Nairobi',
  workArrangement: 'REMOTE',
  employmentType: 'CONTRACT',
  payMin: null,
  payMax: null,
  payPeriod: 'MONTHLY',
  languagesRequired: [],
  requiresLaptop: false,
  requiresLocation: false,
};

describe('matching engine', () => {
  it('scores verified evidence above self-reported claims', () => {
    const claimed = computeMatch(
      { ...baseWorker, skills: [
        { skillSlug: 'excel', level: 'ADVANCED', evidenceLevel: 'SELF_REPORTED' },
        { skillSlug: 'data-entry-cleaning', level: 'ADVANCED', evidenceLevel: 'SELF_REPORTED' },
      ] },
      baseJob,
    );
    const proven = computeMatch(
      { ...baseWorker, skills: [
        { skillSlug: 'excel', level: 'ADVANCED', evidenceLevel: 'SIMULATION_VERIFIED', simulationScore: 84 },
        { skillSlug: 'data-entry-cleaning', level: 'ADVANCED', evidenceLevel: 'SIMULATION_VERIFIED', simulationScore: 80 },
      ] },
      baseJob,
    );
    expect(proven.score).toBeGreaterThan(claimed.score);
  });

  it('orders the evidence ladder correctly', () => {
    expect(EVIDENCE_MULTIPLIER.SELF_REPORTED).toBeLessThan(EVIDENCE_MULTIPLIER.AI_INFERRED);
    expect(EVIDENCE_MULTIPLIER.AI_INFERRED).toBeLessThan(EVIDENCE_MULTIPLIER.SIMULATION_VERIFIED);
    expect(EVIDENCE_MULTIPLIER.SIMULATION_VERIFIED).toBeLessThanOrEqual(EVIDENCE_MULTIPLIER.EMPLOYER_VERIFIED);
  });

  it('never returns a score without at least one reason', () => {
    const result = computeMatch(baseWorker, baseJob);
    expect(result.reasons.length).toBeGreaterThan(0);
    for (const reason of result.reasons) {
      expect(reason.explanation.length).toBeGreaterThan(10);
      expect(['POSITIVE', 'NEGATIVE', 'NEUTRAL']).toContain(reason.impact);
    }
  });

  it('names the missing skills as gaps rather than hiding them', () => {
    const result = computeMatch(baseWorker, baseJob);
    expect(result.gaps.join(' ')).toContain('excel');
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it('keeps scores within 0-100', () => {
    const perfect = computeMatch(
      { ...baseWorker, skills: baseJob.requiredSkills.map((s) => ({
        skillSlug: s.skillSlug, level: 'EXPERT' as const, evidenceLevel: 'EMPLOYER_VERIFIED' as const, simulationScore: 95,
      })), averageRating: 5, ratingCount: 20, tasksCompleted: 30 },
      baseJob,
    );
    expect(perfect.score).toBeLessThanOrEqual(100);
    expect(computeMatch(baseWorker, baseJob).score).toBeGreaterThanOrEqual(0);
  });

  it('treats remote work as location-neutral', () => {
    const elsewhere = { ...baseWorker, regionId: 'region-kisumu', regionName: 'Kisumu' };
    const remote = computeMatch(elsewhere, baseJob);
    const onsite = computeMatch(elsewhere, {
      ...baseJob, workArrangement: 'ONSITE', requiresLocation: true,
    });
    expect(remote.score).toBeGreaterThan(onsite.score);
  });

  it('flags a missing laptop as a blocker without zeroing the score', () => {
    const result = computeMatch(
      { ...baseWorker, hasLaptop: false },
      { ...baseJob, requiresLaptop: true },
    );
    expect(result.blockers.some((b) => b.toLowerCase().includes('laptop'))).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('never surfaces a protected characteristic in its reasoning', () => {
    const result = computeMatch(baseWorker, baseJob);
    const text = JSON.stringify(result).toLowerCase();
    for (const term of ['tribe', 'ethnic', 'religion', 'gender', 'age', 'married', 'pregnan']) {
      expect(text).not.toContain(term);
    }
  });

  it('ranks candidates in descending score order', () => {
    const ranked = rankCandidates(
      [
        { id: 'weak', profile: baseWorker },
        { id: 'strong', profile: { ...baseWorker, skills: [
          { skillSlug: 'excel', level: 'EXPERT', evidenceLevel: 'SIMULATION_VERIFIED', simulationScore: 90 },
          { skillSlug: 'data-entry-cleaning', level: 'ADVANCED', evidenceLevel: 'EMPLOYER_VERIFIED' },
        ] } },
      ],
      baseJob,
    );
    expect(ranked[0]?.id).toBe('strong');
    expect(ranked[0]!.match.score).toBeGreaterThan(ranked[1]!.match.score);
  });

  it('discounts an unavailable worker without removing them', () => {
    const skills = baseJob.requiredSkills.map((s) => ({
      skillSlug: s.skillSlug, level: 'ADVANCED' as const, evidenceLevel: 'SIMULATION_VERIFIED' as const,
    }));
    const available = computeMatch({ ...baseWorker, skills }, baseJob);
    const away = computeMatch({ ...baseWorker, skills, isAvailable: false }, baseJob);
    expect(away.score).toBeLessThan(available.score);
    expect(away.score).toBeGreaterThan(0);
  });
});
