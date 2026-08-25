/**
 * Applications, assignments and the work-submission lifecycle.
 *
 * The task workflow from the product brief is implemented as an explicit state
 * machine (`TASK_TRANSITIONS`) rather than scattered status writes, so an
 * invalid transition is impossible rather than merely unlikely.
 *
 * Every decision that affects a person's income — shortlisting, hiring,
 * approving work, releasing payment — is attributed to a named human actor.
 * A model may rank and explain; it never decides.
 */
import 'server-only';
import { json, sql, withTransaction, type Db } from '@/lib/db/client';
import { conflict, forbidden, notFound, preconditionFailed } from '@/lib/http/errors';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';
import { notify, NOTIFICATIONS } from '@/lib/notifications';
import { holdInEscrow, releasePayment } from '@/lib/payments/service';
import { formatMoney } from '@/lib/payments/ledger';
import type { MatchResult } from '@/lib/matching';

// ---------------------------------------------------------------------------
// Job applications
// ---------------------------------------------------------------------------

export type ApplicationStatus =
  | 'SUBMITTED' | 'VIEWED' | 'SHORTLISTED' | 'INTERVIEWING'
  | 'OFFERED' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';

/**
 * Allowed application transitions.
 *
 * Note there is no path back from REJECTED or WITHDRAWN: an employer who
 * changes their mind creates a new conversation rather than silently
 * resurrecting a closed decision.
 */
const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  SUBMITTED: ['VIEWED', 'SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  VIEWED: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['INTERVIEWING', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  INTERVIEWING: ['OFFERED', 'REJECTED', 'WITHDRAWN'],
  OFFERED: ['HIRED', 'REJECTED', 'WITHDRAWN'],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function canTransitionApplication(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return APPLICATION_TRANSITIONS[from].includes(to);
}

export async function applyToJob(input: {
  jobId: string;
  workerProfileId: string;
  workerUserId: string;
  coverNote?: string | null;
  answers?: unknown[];
  cvFileId?: string | null;
  match: MatchResult;
}): Promise<{ applicationId: string }> {
  return withTransaction(async (tx) => {
    const jobs = await tx<
      Array<{ id: string; title: string; status: string; deadline: Date | null; company_id: string; posted_by: string; company_name: string }>
    >`
      SELECT j.id, j.title, j.status, j.deadline, j.company_id, j.posted_by, c.name AS company_name
      FROM jobs j JOIN companies c ON c.id = j.company_id
      WHERE j.id = ${input.jobId} AND j.deleted_at IS NULL
    `;
    const job = jobs[0];
    if (!job) throw notFound('Job');
    if (job.status !== 'PUBLISHED') throw conflict('This job is no longer accepting applications.');
    if (job.deadline && job.deadline < new Date()) {
      throw conflict('The deadline for this job has passed.');
    }

    const existing = await tx<{ id: string }[]>`
      SELECT id FROM applications
      WHERE job_id = ${input.jobId} AND worker_profile_id = ${input.workerProfileId}
    `;
    if (existing[0]) throw conflict('You have already applied to this job.');

    const rows = await tx<{ id: string }[]>`
      INSERT INTO applications (
        job_id, worker_profile_id, cover_note, answers, cv_file_id, match_score, match_explanation
      ) VALUES (
        ${input.jobId}, ${input.workerProfileId}, ${input.coverNote ?? null},
        ${json(input.answers ?? [])}, ${input.cvFileId ?? null},
        ${input.match.score}, ${json({ reasons: input.match.reasons, gaps: input.match.gaps, band: input.match.band })}
      )
      RETURNING id
    `;
    const application = rows[0];
    if (!application) throw conflict('Could not submit the application.');

    await tx`UPDATE jobs SET application_count = application_count + 1 WHERE id = ${input.jobId}`;

    const template = NOTIFICATIONS.applicationSubmitted(job.title, job.company_name);
    await notify({ userId: input.workerUserId, ...template, actionUrl: `/worker/applications` }, tx);

    const counts = await tx<{ count: string }[]>`
      SELECT count(*)::text AS count FROM applications WHERE job_id = ${input.jobId} AND status = 'SUBMITTED'
    `;
    const employerTemplate = NOTIFICATIONS.newApplicant(job.title, Number(counts[0]?.count ?? 1));
    await notify(
      { userId: job.posted_by, ...employerTemplate, actionUrl: `/employer/jobs/${input.jobId}/applicants` },
      tx,
    );

    await track({
      event: 'job_applied',
      userId: input.workerUserId,
      role: 'WORKER',
      entityType: 'job',
      entityId: input.jobId,
      properties: { matchScore: input.match.score, band: input.match.band },
    }, tx);

    return { applicationId: application.id };
  });
}

export async function updateApplicationStatus(input: {
  applicationId: string;
  status: ApplicationStatus;
  actorId: string;
  actorRole: 'EMPLOYER' | 'ADMIN' | 'WORKER';
  notes?: string | null;
  rejectionReason?: string | null;
}): Promise<void> {
  await withTransaction(async (tx) => {
    const rows = await tx<
      Array<{ id: string; status: ApplicationStatus; job_id: string; job_title: string; posted_by: string; company_name: string; worker_user_id: string }>
    >`
      SELECT a.id, a.status, a.job_id, j.title AS job_title, j.posted_by, c.name AS company_name,
             wp.user_id AS worker_user_id
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN companies c ON c.id = j.company_id
      JOIN worker_profiles wp ON wp.id = a.worker_profile_id
      WHERE a.id = ${input.applicationId}
      FOR UPDATE OF a
    `;
    const application = rows[0];
    if (!application) throw notFound('Application');

    // Authorization: only the posting employer or an admin may decide;
    // the worker may only withdraw.
    if (input.actorRole === 'EMPLOYER' && application.posted_by !== input.actorId) {
      throw forbidden('You can only manage applications to your own jobs.');
    }
    if (input.actorRole === 'WORKER') {
      if (input.status !== 'WITHDRAWN') throw forbidden('You can only withdraw your application.');
      if (application.worker_user_id !== input.actorId) throw forbidden('That is not your application.');
    }

    if (!canTransitionApplication(application.status, input.status)) {
      throw conflict(`An application cannot move from ${application.status} to ${input.status}.`);
    }

    await tx`
      UPDATE applications
      SET status = ${input.status},
          employer_notes = coalesce(${input.notes ?? null}, employer_notes),
          rejection_reason = coalesce(${input.rejectionReason ?? null}, rejection_reason),
          decided_by = ${input.actorId},
          decided_at = now(),
          viewed_at = coalesce(viewed_at, now()),
          shortlisted_at = ${input.status === 'SHORTLISTED' ? sql`now()` : sql`shortlisted_at`},
          withdrawn_at = ${input.status === 'WITHDRAWN' ? sql`now()` : sql`withdrawn_at`}
      WHERE id = ${input.applicationId}
    `;

    if (input.status === 'SHORTLISTED') {
      const template = NOTIFICATIONS.applicationShortlisted(application.job_title, application.company_name);
      await notify({ userId: application.worker_user_id, ...template, actionUrl: '/worker/applications', channels: ['IN_APP', 'EMAIL'] }, tx);
    } else if (input.status === 'REJECTED') {
      const template = NOTIFICATIONS.applicationRejected(application.job_title);
      await notify({ userId: application.worker_user_id, ...template, actionUrl: '/worker/jobs' }, tx);
    }

    if (input.status === 'HIRED') {
      await tx`UPDATE worker_profiles SET jobs_completed = jobs_completed + 1 WHERE user_id = ${application.worker_user_id}`;
      await tx`UPDATE companies SET hires_made = hires_made + 1 WHERE id = (SELECT company_id FROM jobs WHERE id = ${application.job_id})`;
    }

    await track({
      event: input.status === 'SHORTLISTED' ? 'candidate_shortlisted' : input.status === 'HIRED' ? 'candidate_hired' : 'job_applied',
      userId: input.actorId,
      entityType: 'application',
      entityId: input.applicationId,
      properties: { status: input.status },
    }, tx);
  });

  await audit({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: `application.${input.status.toLowerCase()}`,
    entityType: 'application',
    entityId: input.applicationId,
    metadata: { status: input.status },
  });
}

// ---------------------------------------------------------------------------
// Task applications and assignments
// ---------------------------------------------------------------------------

export type TaskStatus =
  | 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ASSIGNED' | 'IN_PROGRESS'
  | 'SUBMITTED' | 'IN_QUALITY_CHECK' | 'APPROVED' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

/** The task lifecycle from §14 of the product brief, as a state machine. */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: ['PENDING_REVIEW', 'PUBLISHED', 'CANCELLED'],
  PENDING_REVIEW: ['PUBLISHED', 'DRAFT', 'CANCELLED'],
  PUBLISHED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'PUBLISHED', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['SUBMITTED', 'CANCELLED', 'DISPUTED'],
  SUBMITTED: ['IN_QUALITY_CHECK', 'IN_PROGRESS', 'APPROVED', 'DISPUTED'],
  IN_QUALITY_CHECK: ['APPROVED', 'IN_PROGRESS', 'DISPUTED'],
  APPROVED: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ['APPROVED', 'CANCELLED', 'COMPLETED'],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export async function applyToTask(input: {
  taskId: string;
  workerProfileId: string;
  workerUserId: string;
  proposal?: string | null;
  bidAmount?: number | null;
  estimatedDays?: number | null;
  aiAssisted: boolean;
  match: MatchResult;
}): Promise<{ applicationId: string }> {
  return withTransaction(async (tx) => {
    const tasks = await tx<
      Array<{ id: string; title: string; status: TaskStatus; deadline: Date | null; workers_needed: number; workers_assigned: number; posted_by: string }>
    >`
      SELECT id, title, status, deadline, workers_needed, workers_assigned, posted_by
      FROM tasks WHERE id = ${input.taskId} AND deleted_at IS NULL
    `;
    const task = tasks[0];
    if (!task) throw notFound('Task');
    if (task.status !== 'PUBLISHED') throw conflict('This task is not open for applications.');
    if (task.workers_assigned >= task.workers_needed) throw conflict('This task is fully assigned.');
    if (task.deadline && task.deadline < new Date()) throw conflict('The deadline for this task has passed.');

    const existing = await tx<{ id: string }[]>`
      SELECT id FROM task_applications WHERE task_id = ${input.taskId} AND worker_profile_id = ${input.workerProfileId}
    `;
    if (existing[0]) throw conflict('You have already applied to this task.');

    const rows = await tx<{ id: string }[]>`
      INSERT INTO task_applications (
        task_id, worker_profile_id, proposal, bid_amount, estimated_days, ai_assisted,
        match_score, match_explanation
      ) VALUES (
        ${input.taskId}, ${input.workerProfileId}, ${input.proposal ?? null},
        ${input.bidAmount ?? null}, ${input.estimatedDays ?? null}, ${input.aiAssisted},
        ${input.match.score}, ${json({ reasons: input.match.reasons, gaps: input.match.gaps })}
      )
      RETURNING id
    `;
    const application = rows[0];
    if (!application) throw conflict('Could not submit the application.');

    await tx`UPDATE tasks SET application_count = application_count + 1 WHERE id = ${input.taskId}`;

    await track({
      event: 'task_applied',
      userId: input.workerUserId,
      role: 'WORKER',
      entityType: 'task',
      entityId: input.taskId,
      properties: { matchScore: input.match.score, aiAssisted: input.aiAssisted },
    }, tx);

    return { applicationId: application.id };
  });
}

/**
 * Accept a worker for a task.
 *
 * Escrow is funded in the same logical step: a worker must never be told to
 * start work that is not funded. If the employer's balance is short, the
 * transaction aborts and nobody is assigned.
 */
export async function acceptTaskApplication(input: {
  applicationId: string;
  actorId: string;
  agreedAmount?: number;
}): Promise<{ assignmentId: string; paymentReference: string }> {
  const context = await withTransaction(async (tx) => {
    const rows = await tx<
      Array<{
        id: string; task_id: string; worker_profile_id: string; status: string;
        bid_amount: string | null; task_title: string; task_status: TaskStatus;
        budget_amount: string; currency: string; workers_needed: number; workers_assigned: number;
        deadline: Date | null; posted_by: string; company_id: string; worker_user_id: string;
      }>
    >`
      SELECT ta.id, ta.task_id, ta.worker_profile_id, ta.status, ta.bid_amount,
             t.title AS task_title, t.status AS task_status, t.budget_amount, t.currency,
             t.workers_needed, t.workers_assigned, t.deadline, t.posted_by, t.company_id,
             wp.user_id AS worker_user_id
      FROM task_applications ta
      JOIN tasks t ON t.id = ta.task_id
      JOIN worker_profiles wp ON wp.id = ta.worker_profile_id
      WHERE ta.id = ${input.applicationId}
      FOR UPDATE OF ta, t
    `;
    const application = rows[0];
    if (!application) throw notFound('Task application');
    if (application.posted_by !== input.actorId) {
      throw forbidden('You can only assign workers to your own tasks.');
    }
    if (application.status !== 'SUBMITTED' && application.status !== 'SHORTLISTED') {
      throw conflict(`This application is already ${application.status}.`);
    }
    if (application.workers_assigned >= application.workers_needed) {
      throw conflict('This task is already fully assigned.');
    }

    const agreed = input.agreedAmount ?? Number(application.bid_amount ?? application.budget_amount);

    const assignments = await tx<{ id: string }[]>`
      INSERT INTO task_assignments (
        task_id, worker_profile_id, application_id, agreed_amount, currency, due_at
      ) VALUES (
        ${application.task_id}, ${application.worker_profile_id}, ${application.id},
        ${agreed}, ${application.currency}, ${application.deadline}
      )
      RETURNING id
    `;
    const assignment = assignments[0];
    if (!assignment) throw conflict('Could not create the assignment.');

    await tx`
      UPDATE task_applications SET status = 'ACCEPTED', decided_by = ${input.actorId}, decided_at = now()
      WHERE id = ${application.id}
    `;

    const nextAssigned = application.workers_assigned + 1;
    await tx`
      UPDATE tasks
      SET workers_assigned = ${nextAssigned},
          status = ${nextAssigned >= application.workers_needed ? 'ASSIGNED' : 'PUBLISHED'}
      WHERE id = ${application.task_id}
    `;

    return {
      assignmentId: assignment.id,
      taskId: application.task_id,
      taskTitle: application.task_title,
      workerUserId: application.worker_user_id,
      companyId: application.company_id,
      agreed,
      currency: application.currency,
    };
  });

  // Fund escrow. A failure here throws before the worker is told to start.
  const payment = await holdInEscrow({
    assignmentId: context.assignmentId,
    employerUserId: input.actorId,
    companyId: context.companyId,
    workerUserId: context.workerUserId,
    taskId: context.taskId,
    grossMinor: context.agreed,
    currency: context.currency,
    idempotencyKey: `escrow:${context.assignmentId}`,
  });

  const template = NOTIFICATIONS.taskAssigned(context.taskTitle, formatMoney(context.agreed, context.currency));
  await notify({
    userId: context.workerUserId,
    ...template,
    actionUrl: `/worker/work/${context.assignmentId}`,
    channels: ['IN_APP', 'EMAIL'],
  });

  await track({
    event: 'task_assigned',
    userId: input.actorId,
    role: 'EMPLOYER',
    entityType: 'task',
    entityId: context.taskId,
    properties: { assignmentId: context.assignmentId, amountMinor: context.agreed },
  });

  await audit({
    actorId: input.actorId,
    actorRole: 'EMPLOYER',
    action: 'task.assigned',
    entityType: 'task_assignment',
    entityId: context.assignmentId,
    metadata: { amountMinor: context.agreed, paymentReference: payment.reference },
  });

  return { assignmentId: context.assignmentId, paymentReference: payment.reference };
}

export async function submitWork(input: {
  assignmentId: string;
  workerUserId: string;
  summary: string;
  content?: string | null;
  externalLinks?: string[];
  fileIds?: string[];
}): Promise<{ submissionId: string; attemptNumber: number }> {
  const result = await withTransaction(async (tx) => {
    const rows = await tx<
      Array<{ id: string; task_id: string; worker_profile_id: string; status: string; task_title: string; posted_by: string; worker_user_id: string; worker_name: string; task_status: TaskStatus }>
    >`
      SELECT a.id, a.task_id, a.worker_profile_id, a.status,
             t.title AS task_title, t.posted_by, t.status AS task_status,
             wp.user_id AS worker_user_id, u.full_name AS worker_name
      FROM task_assignments a
      JOIN tasks t ON t.id = a.task_id
      JOIN worker_profiles wp ON wp.id = a.worker_profile_id
      JOIN users u ON u.id = wp.user_id
      WHERE a.id = ${input.assignmentId}
      FOR UPDATE OF a
    `;
    const assignment = rows[0];
    if (!assignment) throw notFound('Assignment');
    if (assignment.worker_user_id !== input.workerUserId) throw forbidden('That is not your assignment.');
    if (assignment.status !== 'ACTIVE') {
      throw conflict(`This assignment is ${assignment.status.toLowerCase()} and cannot accept a submission.`);
    }

    const attempts = await tx<{ count: string }[]>`
      SELECT count(*)::text AS count FROM work_submissions WHERE assignment_id = ${input.assignmentId}
    `;
    const attemptNumber = Number(attempts[0]?.count ?? 0) + 1;

    const submissions = await tx<{ id: string }[]>`
      INSERT INTO work_submissions (
        assignment_id, task_id, worker_profile_id, summary, content, external_links, attempt_number
      ) VALUES (
        ${input.assignmentId}, ${assignment.task_id}, ${assignment.worker_profile_id},
        ${input.summary}, ${input.content ?? null}, ${input.externalLinks ?? []}, ${attemptNumber}
      )
      RETURNING id
    `;
    const submission = submissions[0];
    if (!submission) throw conflict('Could not record the submission.');

    for (const fileId of input.fileIds ?? []) {
      await tx`
        INSERT INTO submission_files (submission_id, file_id) VALUES (${submission.id}, ${fileId})
        ON CONFLICT DO NOTHING
      `;
    }

    await tx`UPDATE task_assignments SET status = 'SUBMITTED' WHERE id = ${input.assignmentId}`;

    if (canTransitionTask(assignment.task_status, 'SUBMITTED')) {
      await tx`UPDATE tasks SET status = 'SUBMITTED' WHERE id = ${assignment.task_id}`;
    }

    const template = NOTIFICATIONS.taskSubmitted(assignment.task_title, assignment.worker_name);
    await notify(
      { userId: assignment.posted_by, ...template, actionUrl: `/employer/work/${input.assignmentId}`, channels: ['IN_APP', 'EMAIL'] },
      tx,
    );

    await track({
      event: 'task_submitted',
      userId: input.workerUserId,
      role: 'WORKER',
      entityType: 'task',
      entityId: assignment.task_id,
      properties: { attemptNumber },
    }, tx);

    return { submissionId: submission.id, attemptNumber };
  });

  return result;
}

/**
 * Approve submitted work and release payment.
 *
 * Approval and release are deliberately one operation: an employer cannot
 * accept work and then leave a worker waiting for money.
 */
export async function approveWork(input: {
  submissionId: string;
  actorId: string;
  qualityRating?: number | null;
  notes?: string | null;
}): Promise<{ netPaid: number; assignmentId: string }> {
  const context = await withTransaction(async (tx) => {
    const rows = await tx<
      Array<{ id: string; assignment_id: string; task_id: string; status: string; posted_by: string; task_title: string; worker_user_id: string; currency: string; payment_id: string | null }>
    >`
      SELECT ws.id, ws.assignment_id, ws.task_id, ws.status,
             t.posted_by, t.title AS task_title, t.currency,
             wp.user_id AS worker_user_id,
             (SELECT p.id FROM payments p WHERE p.assignment_id = ws.assignment_id
               AND p.status = 'HELD_IN_ESCROW' LIMIT 1) AS payment_id
      FROM work_submissions ws
      JOIN tasks t ON t.id = ws.task_id
      JOIN worker_profiles wp ON wp.id = ws.worker_profile_id
      WHERE ws.id = ${input.submissionId}
      FOR UPDATE OF ws
    `;
    const submission = rows[0];
    if (!submission) throw notFound('Submission');
    if (submission.posted_by !== input.actorId) throw forbidden('You can only approve work on your own tasks.');
    if (submission.status === 'APPROVED') throw conflict('This submission is already approved.');
    if (!submission.payment_id) {
      throw preconditionFailed('No escrowed payment was found for this assignment. Contact support before approving.');
    }

    await tx`
      UPDATE work_submissions
      SET status = 'APPROVED', reviewer_id = ${input.actorId}, reviewer_notes = ${input.notes ?? null},
          quality_rating = ${input.qualityRating ?? null}, reviewed_at = now()
      WHERE id = ${input.submissionId}
    `;
    await tx`
      UPDATE task_assignments SET status = 'APPROVED', completed_at = now() WHERE id = ${submission.assignment_id}
    `;

    // The task completes only once every assigned worker is approved.
    const outstanding = await tx<{ count: string }[]>`
      SELECT count(*)::text AS count FROM task_assignments
      WHERE task_id = ${submission.task_id} AND status NOT IN ('APPROVED', 'CANCELLED')
    `;
    if (Number(outstanding[0]?.count ?? 0) === 0) {
      await tx`UPDATE tasks SET status = 'COMPLETED', completed_at = now() WHERE id = ${submission.task_id}`;
    }

    return {
      paymentId: submission.payment_id,
      assignmentId: submission.assignment_id,
      taskId: submission.task_id,
      taskTitle: submission.task_title,
      workerUserId: submission.worker_user_id,
      currency: submission.currency,
    };
  });

  const release = await releasePayment({ paymentId: context.paymentId, actorId: input.actorId, reason: 'Work approved' });

  const approvedTemplate = NOTIFICATIONS.workApproved(context.taskTitle, formatMoney(release.netPaid, context.currency));
  await notify({
    userId: context.workerUserId,
    ...approvedTemplate,
    actionUrl: '/worker/earnings',
    channels: ['IN_APP', 'EMAIL'],
  });

  await track({
    event: 'task_approved',
    userId: input.actorId,
    role: 'EMPLOYER',
    entityType: 'task',
    entityId: context.taskId,
    properties: { netPaidMinor: release.netPaid },
  });
  await track({
    event: 'payment_completed',
    userId: context.workerUserId,
    role: 'WORKER',
    entityType: 'payment',
    entityId: context.paymentId,
    properties: { netPaidMinor: release.netPaid },
  });

  return { netPaid: release.netPaid, assignmentId: context.assignmentId };
}

export async function requestRevision(input: {
  submissionId: string;
  actorId: string;
  notes: string;
}): Promise<void> {
  await withTransaction(async (tx) => {
    const rows = await tx<
      Array<{ id: string; assignment_id: string; task_id: string; posted_by: string; task_title: string; worker_user_id: string; status: string }>
    >`
      SELECT ws.id, ws.assignment_id, ws.task_id, ws.status, t.posted_by, t.title AS task_title,
             wp.user_id AS worker_user_id
      FROM work_submissions ws
      JOIN tasks t ON t.id = ws.task_id
      JOIN worker_profiles wp ON wp.id = ws.worker_profile_id
      WHERE ws.id = ${input.submissionId}
      FOR UPDATE OF ws
    `;
    const submission = rows[0];
    if (!submission) throw notFound('Submission');
    if (submission.posted_by !== input.actorId) throw forbidden('You can only review work on your own tasks.');
    if (submission.status === 'APPROVED') throw conflict('Approved work cannot be sent back for revision.');

    await tx`
      UPDATE work_submissions
      SET status = 'REVISION_REQUESTED', reviewer_id = ${input.actorId},
          reviewer_notes = ${input.notes}, reviewed_at = now()
      WHERE id = ${input.submissionId}
    `;
    await tx`UPDATE task_assignments SET status = 'ACTIVE' WHERE id = ${submission.assignment_id}`;
    await tx`UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = ${submission.task_id} AND status = 'SUBMITTED'`;

    const template = NOTIFICATIONS.revisionRequested(submission.task_title);
    await notify(
      { userId: submission.worker_user_id, ...template, actionUrl: `/worker/work/${submission.assignment_id}`, channels: ['IN_APP', 'EMAIL'] },
      tx,
    );

    await track({
      event: 'revision_requested',
      userId: input.actorId,
      role: 'EMPLOYER',
      entityType: 'task',
      entityId: submission.task_id,
    }, tx);
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listWorkerApplications(
  profileId: string,
  page: { limit: number; offset: number },
  db: Db = sql,
) {
  const rows = await db<
    Array<{
      id: string; status: string; match_score: number | null; created_at: Date;
      job_id: string; job_title: string; company_name: string; kind: string; total: string;
    }>
  >`
    SELECT a.id, a.status::text, a.match_score, a.created_at,
           j.id AS job_id, j.title AS job_title, c.name AS company_name, 'JOB' AS kind,
           count(*) OVER ()::text AS total
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN companies c ON c.id = j.company_id
    WHERE a.worker_profile_id = ${profileId}
    ORDER BY a.created_at DESC
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  return { items: rows, total: Number(rows[0]?.total ?? 0) };
}

export async function listWorkerTaskApplications(
  profileId: string,
  page: { limit: number; offset: number },
  db: Db = sql,
) {
  const rows = await db<
    Array<{
      id: string; status: string; match_score: number | null; created_at: Date;
      task_id: string; task_title: string; company_name: string; budget_amount: string;
      currency: string; assignment_id: string | null; total: string;
    }>
  >`
    SELECT ta.id, ta.status::text, ta.match_score, ta.created_at,
           t.id AS task_id, t.title AS task_title, c.name AS company_name,
           t.budget_amount, t.currency,
           (SELECT a.id FROM task_assignments a WHERE a.application_id = ta.id LIMIT 1) AS assignment_id,
           count(*) OVER ()::text AS total
    FROM task_applications ta
    JOIN tasks t ON t.id = ta.task_id
    JOIN companies c ON c.id = t.company_id
    WHERE ta.worker_profile_id = ${profileId}
    ORDER BY ta.created_at DESC
    LIMIT ${page.limit} OFFSET ${page.offset}
  `;
  return { items: rows, total: Number(rows[0]?.total ?? 0) };
}

/** Applicants for one job, ranked by match score, for the employer's review. */
export async function listJobApplicants(jobId: string, db: Db = sql) {
  return db<
    Array<{
      id: string; status: string; match_score: number | null; match_explanation: unknown;
      cover_note: string | null; created_at: Date; viewed_at: Date | null;
      worker_profile_id: string; full_name: string; headline: string | null;
      photo_url: string | null; region_name: string | null; readiness_score: number;
      verified_skill_count: number; avg_rating: string | null; rating_count: number;
      tasks_completed: number;
    }>
  >`
    SELECT a.id, a.status::text, a.match_score, a.match_explanation, a.cover_note,
           a.created_at, a.viewed_at,
           wp.id AS worker_profile_id, u.full_name, wp.headline, wp.photo_url,
           r.name AS region_name, wp.readiness_score, wp.avg_rating, wp.rating_count,
           wp.tasks_completed,
           (SELECT count(*)::int FROM worker_skills ws
             WHERE ws.worker_profile_id = wp.id
               AND ws.evidence_level IN ('SIMULATION_VERIFIED','EMPLOYER_VERIFIED')) AS verified_skill_count
    FROM applications a
    JOIN worker_profiles wp ON wp.id = a.worker_profile_id
    JOIN users u ON u.id = wp.user_id
    LEFT JOIN regions r ON r.id = wp.region_id
    WHERE a.job_id = ${jobId}
    ORDER BY
      CASE a.status WHEN 'SHORTLISTED' THEN 0 WHEN 'INTERVIEWING' THEN 1 WHEN 'SUBMITTED' THEN 2 ELSE 3 END,
      a.match_score DESC NULLS LAST,
      a.created_at DESC
  `;
}

export async function listTaskApplicants(taskId: string, db: Db = sql) {
  return db<
    Array<{
      id: string; status: string; match_score: number | null; match_explanation: unknown;
      proposal: string | null; bid_amount: string | null; estimated_days: number | null;
      ai_assisted: boolean; created_at: Date;
      worker_profile_id: string; full_name: string; headline: string | null;
      photo_url: string | null; readiness_score: number; verified_skill_count: number;
      avg_rating: string | null; rating_count: number; tasks_completed: number;
      completion_rate: string | null;
    }>
  >`
    SELECT ta.id, ta.status::text, ta.match_score, ta.match_explanation, ta.proposal,
           ta.bid_amount, ta.estimated_days, ta.ai_assisted, ta.created_at,
           wp.id AS worker_profile_id, u.full_name, wp.headline, wp.photo_url,
           wp.readiness_score, wp.avg_rating, wp.rating_count, wp.tasks_completed, wp.completion_rate,
           (SELECT count(*)::int FROM worker_skills ws
             WHERE ws.worker_profile_id = wp.id
               AND ws.evidence_level IN ('SIMULATION_VERIFIED','EMPLOYER_VERIFIED')) AS verified_skill_count
    FROM task_applications ta
    JOIN worker_profiles wp ON wp.id = ta.worker_profile_id
    JOIN users u ON u.id = wp.user_id
    WHERE ta.task_id = ${taskId}
    ORDER BY ta.match_score DESC NULLS LAST, ta.created_at DESC
  `;
}

export async function getAssignment(assignmentId: string, db: Db = sql) {
  const rows = await db<
    Array<{
      id: string; task_id: string; status: string; agreed_amount: string; currency: string;
      due_at: Date | null; started_at: Date; completed_at: Date | null;
      task_title: string; task_description: string; expected_output: string;
      quality_requirements: string | null; company_name: string; posted_by: string;
      worker_user_id: string; worker_profile_id: string; worker_name: string;
      payment_status: string | null;
    }>
  >`
    SELECT a.id, a.task_id, a.status, a.agreed_amount, a.currency, a.due_at, a.started_at, a.completed_at,
           t.title AS task_title, t.description AS task_description, t.expected_output,
           t.quality_requirements, t.posted_by, c.name AS company_name,
           wp.user_id AS worker_user_id, wp.id AS worker_profile_id, u.full_name AS worker_name,
           (SELECT p.status::text FROM payments p WHERE p.assignment_id = a.id ORDER BY p.created_at DESC LIMIT 1) AS payment_status
    FROM task_assignments a
    JOIN tasks t ON t.id = a.task_id
    JOIN companies c ON c.id = t.company_id
    JOIN worker_profiles wp ON wp.id = a.worker_profile_id
    JOIN users u ON u.id = wp.user_id
    WHERE a.id = ${assignmentId}
  `;
  return rows[0] ?? null;
}

export async function listSubmissions(assignmentId: string, db: Db = sql) {
  return db<
    Array<{
      id: string; summary: string; content: string | null; external_links: string[];
      attempt_number: number; status: string; reviewer_notes: string | null;
      quality_rating: number | null; submitted_at: Date; reviewed_at: Date | null;
    }>
  >`
    SELECT id, summary, content, external_links, attempt_number, status::text,
           reviewer_notes, quality_rating, submitted_at, reviewed_at
    FROM work_submissions
    WHERE assignment_id = ${assignmentId}
    ORDER BY attempt_number DESC
  `;
}
