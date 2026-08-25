import { describe, expect, it } from 'vitest';
import {
  createEmployer, createTask, createWorker, fundEmployer,
  hasDatabase, testDb, useCleanDatabase, walletFor,
} from './helpers';
import {
  acceptTaskApplication, applyToJob, applyToTask, approveWork,
  canTransitionApplication, canTransitionTask, requestRevision, submitWork,
} from '@/lib/domain/applications';
import { buildMatchProfile, recomputeReadiness, upsertWorkerSkill } from '@/lib/domain/workers';
import { computeMatch } from '@/lib/matching';
import { splitFee } from '@/lib/payments/ledger';

const MATCH = {
  score: 75,
  reasons: [{ factor: 'Required skills', impact: 'POSITIVE' as const, weight: 0.3, explanation: 'Has the skills.' }],
  gaps: [],
  band: 'GOOD_FIT' as const,
  blockers: [],
};

describe('state machines', () => {
  it('allows only the documented application transitions', () => {
    expect(canTransitionApplication('SUBMITTED', 'SHORTLISTED')).toBe(true);
    expect(canTransitionApplication('SHORTLISTED', 'INTERVIEWING')).toBe(true);
    expect(canTransitionApplication('OFFERED', 'HIRED')).toBe(true);

    // Terminal states are terminal: a rejection is not quietly reversible.
    expect(canTransitionApplication('REJECTED', 'SHORTLISTED')).toBe(false);
    expect(canTransitionApplication('HIRED', 'REJECTED')).toBe(false);
    expect(canTransitionApplication('SUBMITTED', 'HIRED')).toBe(false);
  });

  it('allows only the documented task transitions', () => {
    expect(canTransitionTask('PUBLISHED', 'ASSIGNED')).toBe(true);
    expect(canTransitionTask('IN_PROGRESS', 'SUBMITTED')).toBe(true);
    expect(canTransitionTask('SUBMITTED', 'APPROVED')).toBe(true);
    expect(canTransitionTask('APPROVED', 'COMPLETED')).toBe(true);

    expect(canTransitionTask('COMPLETED', 'PUBLISHED')).toBe(false);
    expect(canTransitionTask('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionTask('CANCELLED', 'PUBLISHED')).toBe(false);
  });
});

describe.skipIf(!hasDatabase)('task workflow, end to end', () => {
  useCleanDatabase();

  it('carries a task from application through to the worker being paid', async () => {
    const sql = testDb();
    const budget = 20_000_00;

    const employer = await createEmployer('flow-employer@test.local');
    const worker = await createWorker('flow-worker@test.local', { skills: ['excel'] });
    await fundEmployer(employer.userId, 100_000_00);

    const taskId = await createTask({
      companyId: employer.companyId,
      postedBy: employer.userId,
      budgetMinor: budget,
      skills: ['excel'],
    });

    // 1. Worker applies.
    const application = await applyToTask({
      taskId,
      workerProfileId: worker.profileId,
      workerUserId: worker.userId,
      proposal: 'I can do this.',
      bidAmount: budget,
      estimatedDays: 3,
      aiAssisted: false,
      match: MATCH,
    });
    expect(application.applicationId).toBeTruthy();

    // 2. Employer accepts — this must fund escrow in the same step.
    const accepted = await acceptTaskApplication({
      applicationId: application.applicationId,
      actorId: employer.userId,
    });

    const afterAccept = await walletFor(employer.userId, 'EMPLOYER');
    expect(afterAccept.escrow).toBe(budget);
    expect(afterAccept.available).toBe(100_000_00 - budget);

    // The worker can see funds committed before starting work.
    expect((await walletFor(worker.userId, 'WORKER')).pending).toBe(splitFee(budget, 1000).net);

    // 3. Worker submits.
    const submission = await submitWork({
      assignmentId: accepted.assignmentId,
      workerUserId: worker.userId,
      summary: 'Delivered the cleaned dataset with a full change log.',
      content: 'Detailed output.',
    });
    expect(submission.attemptNumber).toBe(1);

    // 4. Employer requests a revision, and the worker resubmits.
    await requestRevision({
      submissionId: submission.submissionId,
      actorId: employer.userId,
      notes: 'Please also de-duplicate the phone numbers before resubmitting.',
    });

    const second = await submitWork({
      assignmentId: accepted.assignmentId,
      workerUserId: worker.userId,
      summary: 'Resubmitted with phone numbers de-duplicated.',
    });
    expect(second.attemptNumber).toBe(2);

    // 5. Employer approves — payment releases in the same operation.
    const approval = await approveWork({
      submissionId: second.submissionId,
      actorId: employer.userId,
      qualityRating: 5,
    });

    const { net } = splitFee(budget, 1000);
    expect(approval.netPaid).toBe(net);

    const workerWallet = await walletFor(worker.userId, 'WORKER');
    expect(workerWallet.available).toBe(net);
    expect(workerWallet.pending).toBe(0);

    // 6. The task and assignment reach their terminal states.
    const tasks = await sql<{ status: string }[]>`SELECT status::text FROM tasks WHERE id = ${taskId}`;
    expect(tasks[0]?.status).toBe('COMPLETED');

    const assignments = await sql<{ status: string }[]>`
      SELECT status FROM task_assignments WHERE id = ${accepted.assignmentId}
    `;
    expect(assignments[0]?.status).toBe('APPROVED');
  });

  it('will not let a different worker submit against an assignment', async () => {
    const employer = await createEmployer('owner@test.local');
    const worker = await createWorker('legit@test.local');
    const intruder = await createWorker('intruder@test.local');
    await fundEmployer(employer.userId, 100_000_00);

    const taskId = await createTask({ companyId: employer.companyId, postedBy: employer.userId, budgetMinor: 5_000_00 });
    const application = await applyToTask({
      taskId, workerProfileId: worker.profileId, workerUserId: worker.userId,
      proposal: 'Mine', aiAssisted: false, match: MATCH,
    });
    const accepted = await acceptTaskApplication({ applicationId: application.applicationId, actorId: employer.userId });

    await expect(
      submitWork({
        assignmentId: accepted.assignmentId,
        workerUserId: intruder.userId,
        summary: 'Trying to submit work that is not mine.',
      }),
    ).rejects.toThrow(/not your assignment/i);
  });

  it('will not let a different employer approve work', async () => {
    const employer = await createEmployer('real@test.local');
    const other = await createEmployer('other@test.local', 'Other Company');
    const worker = await createWorker('w@test.local');
    await fundEmployer(employer.userId, 100_000_00);

    const taskId = await createTask({ companyId: employer.companyId, postedBy: employer.userId, budgetMinor: 5_000_00 });
    const application = await applyToTask({
      taskId, workerProfileId: worker.profileId, workerUserId: worker.userId,
      proposal: 'Ready', aiAssisted: false, match: MATCH,
    });
    const accepted = await acceptTaskApplication({ applicationId: application.applicationId, actorId: employer.userId });
    const submission = await submitWork({
      assignmentId: accepted.assignmentId, workerUserId: worker.userId, summary: 'Done and delivered.',
    });

    await expect(
      approveWork({ submissionId: submission.submissionId, actorId: other.userId }),
    ).rejects.toThrow(/your own tasks/i);
  });

  it('refuses a duplicate application to the same task', async () => {
    const employer = await createEmployer('dupe@test.local');
    const worker = await createWorker('dupeworker@test.local');
    const taskId = await createTask({ companyId: employer.companyId, postedBy: employer.userId, budgetMinor: 5_000_00 });

    await applyToTask({
      taskId, workerProfileId: worker.profileId, workerUserId: worker.userId,
      proposal: 'First', aiAssisted: false, match: MATCH,
    });

    await expect(
      applyToTask({
        taskId, workerProfileId: worker.profileId, workerUserId: worker.userId,
        proposal: 'Second', aiAssisted: false, match: MATCH,
      }),
    ).rejects.toThrow(/already applied/i);
  });

  it('will not assign more workers than the task needs', async () => {
    const employer = await createEmployer('single@test.local');
    const first = await createWorker('first@test.local');
    const second = await createWorker('second@test.local');
    await fundEmployer(employer.userId, 100_000_00);

    const taskId = await createTask({
      companyId: employer.companyId, postedBy: employer.userId, budgetMinor: 5_000_00, workersNeeded: 1,
    });

    const a = await applyToTask({
      taskId, workerProfileId: first.profileId, workerUserId: first.userId,
      proposal: 'A', aiAssisted: false, match: MATCH,
    });
    const b = await applyToTask({
      taskId, workerProfileId: second.profileId, workerUserId: second.userId,
      proposal: 'B', aiAssisted: false, match: MATCH,
    });

    await acceptTaskApplication({ applicationId: a.applicationId, actorId: employer.userId });
    await expect(
      acceptTaskApplication({ applicationId: b.applicationId, actorId: employer.userId }),
    ).rejects.toThrow(/fully assigned/i);
  });
});

describe.skipIf(!hasDatabase)('job applications', () => {
  useCleanDatabase();

  it('stores the match explanation alongside the application', async () => {
    const sql = testDb();
    const employer = await createEmployer('jobemployer@test.local');
    const worker = await createWorker('jobworker@test.local', { skills: ['customer-support'] });

    const jobs = await sql<{ id: string }[]>`
      INSERT INTO jobs (
        company_id, posted_by, title, slug, description, category, employment_type, status, published_at
      ) VALUES (
        ${employer.companyId}, ${employer.userId}, 'Support Agent', 'support-agent-1',
        'Handle customer enquiries.', 'Customer Support', 'FULL_TIME', 'PUBLISHED', now()
      ) RETURNING id
    `;
    const jobId = jobs[0]?.id as string;

    const result = await applyToJob({
      jobId,
      workerProfileId: worker.profileId,
      workerUserId: worker.userId,
      coverNote: 'I have three years of support experience.',
      match: MATCH,
    });

    const rows = await sql<{ match_score: number; match_explanation: { reasons?: unknown[] } }[]>`
      SELECT match_score, match_explanation FROM applications WHERE id = ${result.applicationId}
    `;
    expect(rows[0]?.match_score).toBe(75);
    // Stored as a real jsonb object, not a JSON string.
    expect(Array.isArray(rows[0]?.match_explanation.reasons)).toBe(true);
  });

  it('refuses applications to an unpublished job', async () => {
    const sql = testDb();
    const employer = await createEmployer('draftemployer@test.local');
    const worker = await createWorker('draftworker@test.local');

    const jobs = await sql<{ id: string }[]>`
      INSERT INTO jobs (company_id, posted_by, title, slug, description, category, employment_type, status)
      VALUES (${employer.companyId}, ${employer.userId}, 'Draft Role', 'draft-role-1',
              'Not live yet.', 'Operations', 'FULL_TIME', 'DRAFT')
      RETURNING id
    `;

    await expect(
      applyToJob({
        jobId: jobs[0]?.id as string,
        workerProfileId: worker.profileId,
        workerUserId: worker.userId,
        match: MATCH,
      }),
    ).rejects.toThrow(/no longer accepting/i);
  });
});

describe.skipIf(!hasDatabase)('evidence ladder', () => {
  useCleanDatabase();

  it('never downgrades verified evidence to a self-report', async () => {
    const sql = testDb();
    const worker = await createWorker('evidence@test.local');

    await upsertWorkerSkill(worker.profileId, {
      skillSlug: 'excel',
      assessedLevel: 'ADVANCED',
      evidenceLevel: 'SIMULATION_VERIFIED',
      source: 'SIMULATION',
    });

    // A later self-report must not overwrite proven evidence.
    await upsertWorkerSkill(worker.profileId, {
      skillSlug: 'excel',
      selfReportedLevel: 'BEGINNER',
      evidenceLevel: 'SELF_REPORTED',
      source: 'ONBOARDING',
    });

    const rows = await sql<{ evidence_level: string }[]>`
      SELECT ws.evidence_level FROM worker_skills ws
      JOIN skills s ON s.id = ws.skill_id
      WHERE ws.worker_profile_id = ${worker.profileId} AND s.slug = 'excel'
    `;
    expect(rows[0]?.evidence_level).toBe('SIMULATION_VERIFIED');
  });

  it('weights verified skills above claimed ones in matching', async () => {
    const claimer = await createWorker('claimer@test.local', { skills: ['excel', 'data-entry-cleaning'] });
    const prover = await createWorker('prover@test.local');

    for (const slug of ['excel', 'data-entry-cleaning']) {
      await upsertWorkerSkill(prover.profileId, {
        skillSlug: slug,
        assessedLevel: 'ADVANCED',
        evidenceLevel: 'SIMULATION_VERIFIED',
        source: 'SIMULATION',
      });
    }

    const requirements = {
      kind: 'TASK' as const,
      requiredSkills: [{ skillSlug: 'excel' }, { skillSlug: 'data-entry-cleaning' }],
      preferredSkills: [],
      minYearsExperience: 0,
      minEducation: null,
      regionId: null,
      regionName: null,
      workArrangement: 'REMOTE' as const,
      employmentType: 'GIG',
      payMin: null,
      payMax: null,
      payPeriod: 'PER_TASK',
      languagesRequired: [],
      requiresLaptop: false,
      requiresLocation: false,
    };

    const claimed = computeMatch(await buildMatchProfile(claimer.profileId), requirements);
    const proven = computeMatch(await buildMatchProfile(prover.profileId), requirements);

    expect(proven.score).toBeGreaterThan(claimed.score);
  });

  it('raises readiness when a skill becomes verified', async () => {
    const worker = await createWorker('readiness@test.local', { skills: ['excel'] });
    const before = await recomputeReadiness(worker.profileId);

    await upsertWorkerSkill(worker.profileId, {
      skillSlug: 'excel',
      assessedLevel: 'ADVANCED',
      evidenceLevel: 'SIMULATION_VERIFIED',
      source: 'SIMULATION',
    });

    const after = await recomputeReadiness(worker.profileId);
    expect(after.score).toBeGreaterThan(before.score);
  });
});
