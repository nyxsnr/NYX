import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { created } from '@/lib/http/response';
import { sql, withTransaction } from '@/lib/db/client';
import { conflict, forbidden, notFound } from '@/lib/http/errors';
import { optionalLongText, rating, uuid } from '@/lib/validation/common';
import { detectReviewManipulation } from '@/lib/reputation';
import { refreshWorkerStats } from '@/lib/domain/workers';
import { audit } from '@/lib/audit';
import { track } from '@/lib/analytics';

const body = z.object({
  assignmentId: uuid,
  rating,
  qualityRating: rating.optional(),
  communicationRating: rating.optional(),
  timelinessRating: rating.optional(),
  comment: optionalLongText(2000),
});

/**
 * Leave a review.
 *
 * Reviews must be anchored to completed, approved work — the schema rejects
 * unanchored rows, and this handler additionally requires the assignment to be
 * approved. Manipulation heuristics run on write; a flagged review is withheld
 * from published averages pending admin review, never deleted.
 */
export const POST = route(
  { body, auth: 'required', roles: ['WORKER', 'EMPLOYER'], permission: 'review:write', rateLimit: { name: 'write', by: 'user' } },
  async (ctx) => {
    const rows = await sql<
      Array<{ id: string; status: string; task_id: string; posted_by: string; worker_user_id: string; completed_at: Date | null }>
    >`
      SELECT a.id, a.status, a.task_id, t.posted_by, wp.user_id AS worker_user_id, a.completed_at
      FROM task_assignments a
      JOIN tasks t ON t.id = a.task_id
      JOIN worker_profiles wp ON wp.id = a.worker_profile_id
      WHERE a.id = ${ctx.body.assignmentId}
    `;
    const assignment = rows[0];
    if (!assignment) throw notFound('Assignment');
    if (assignment.status !== 'APPROVED') {
      throw conflict('You can only review work that has been completed and approved.');
    }

    const isEmployer = assignment.posted_by === ctx.auth.user.id;
    const isWorker = assignment.worker_user_id === ctx.auth.user.id;
    if (!isEmployer && !isWorker) throw forbidden('You were not part of this work.');

    const subjectUserId = isEmployer ? assignment.worker_user_id : assignment.posted_by;
    const subjectKind = isEmployer ? 'WORKER' : 'EMPLOYER';

    const existing = await sql<{ id: string }[]>`
      SELECT id FROM reviews
      WHERE author_id = ${ctx.auth.user.id} AND assignment_id = ${ctx.body.assignmentId} AND deleted_at IS NULL
    `;
    if (existing[0]) throw conflict('You have already reviewed this work.');

    const [authorHistory, subjectHistory, reciprocal, accountAges] = await Promise.all([
      sql<Array<{ subject_user_id: string; rating: number; created_at: Date }>>`
        SELECT subject_user_id, rating, created_at FROM reviews
        WHERE author_id = ${ctx.auth.user.id} AND deleted_at IS NULL
      `,
      sql<Array<{ author_id: string; rating: number; created_at: Date }>>`
        SELECT author_id, rating, created_at FROM reviews
        WHERE subject_user_id = ${subjectUserId} AND deleted_at IS NULL
      `,
      sql<{ id: string }[]>`
        SELECT id FROM reviews
        WHERE author_id = ${subjectUserId} AND subject_user_id = ${ctx.auth.user.id} AND deleted_at IS NULL
      `,
      sql<{ close: boolean }[]>`
        SELECT (abs(extract(epoch FROM (a.created_at - b.created_at))) < 3600) AS close
        FROM users a, users b WHERE a.id = ${ctx.auth.user.id} AND b.id = ${subjectUserId}
      `,
    ]);

    const screening = detectReviewManipulation({
      review: {
        rating: ctx.body.rating,
        authorId: ctx.auth.user.id,
        createdAt: new Date(),
        isFlagged: false,
        comment: ctx.body.comment ?? null,
        assignmentId: ctx.body.assignmentId,
      },
      authorHistory: authorHistory.map((r) => ({ subjectUserId: r.subject_user_id, rating: r.rating, createdAt: r.created_at })),
      subjectHistory: subjectHistory.map((r) => ({ authorId: r.author_id, rating: r.rating, createdAt: r.created_at })),
      hasCompletedWork: true,
      isReciprocal: reciprocal.length > 0,
      accountsCreatedCloseTogether: accountAges[0]?.close ?? false,
    });

    const reviewId = await withTransaction(async (tx) => {
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO reviews (
          subject_kind, subject_user_id, author_id, assignment_id, task_id,
          rating, quality_rating, communication_rating, timeliness_rating, comment,
          is_flagged, flag_reason
        ) VALUES (
          ${subjectKind}, ${subjectUserId}, ${ctx.auth.user.id},
          ${ctx.body.assignmentId}, ${assignment.task_id},
          ${ctx.body.rating}, ${ctx.body.qualityRating ?? null},
          ${ctx.body.communicationRating ?? null}, ${ctx.body.timelinessRating ?? null},
          ${ctx.body.comment ?? null},
          ${screening.suspicious},
          ${screening.suspicious ? screening.signals.map((s) => s.rule).join(', ') : null}
        )
        RETURNING id
      `;
      return inserted[0]?.id ?? '';
    });

    if (screening.suspicious) {
      for (const signal of screening.signals) {
        await sql`
          INSERT INTO fraud_flags (user_id, entity_type, entity_id, rule, severity, score, reason, detected_by)
          VALUES (
            ${ctx.auth.user.id}, 'review', ${reviewId}, ${signal.rule},
            ${signal.severity}, ${screening.score}, ${signal.explanation}, 'heuristic'
          )
        `;
      }
    }

    if (subjectKind === 'WORKER') {
      const profiles = await sql<{ id: string }[]>`SELECT id FROM worker_profiles WHERE user_id = ${subjectUserId}`;
      if (profiles[0]) await refreshWorkerStats(profiles[0].id);
    } else {
      await sql`
        UPDATE companies c SET
          avg_rating = agg.avg_rating, rating_count = agg.rating_count
        FROM (
          SELECT round(avg(r.rating), 2) AS avg_rating, count(*)::int AS rating_count
          FROM reviews r WHERE r.subject_user_id = ${subjectUserId}
            AND r.deleted_at IS NULL AND r.is_published AND NOT r.is_flagged
        ) agg
        WHERE c.id = (SELECT company_id FROM employer_profiles WHERE user_id = ${subjectUserId})
      `;
    }

    await audit({
      actorId: ctx.auth.user.id,
      action: 'review.created',
      entityType: 'review',
      entityId: reviewId,
      metadata: { rating: ctx.body.rating, flagged: screening.suspicious },
    });
    await track({ event: 'review_submitted', userId: ctx.auth.user.id, properties: { rating: ctx.body.rating } });

    return created({
      id: reviewId,
      // Told plainly, so a legitimate reviewer is not left wondering.
      published: !screening.suspicious,
      message: screening.suspicious
        ? 'Your review has been recorded and is awaiting a quick check before it appears publicly.'
        : 'Your review has been published.',
    });
  },
);
