/**
 * Reputation engine.
 *
 * Two rules shape everything here:
 *
 *   1. One bad rating must not destroy someone's livelihood. Averages are
 *      Bayesian-smoothed toward a neutral prior until there is enough data,
 *      and a published rating is withheld entirely below a minimum count.
 *   2. Recent behaviour matters more than old behaviour, but old good
 *      behaviour is not erased by one recent lapse.
 *
 * All functions are pure so the rules can be unit-tested and explained.
 */

/** Ratings are hidden below this many reviews — too few to be fair. */
export const MIN_REVIEWS_TO_PUBLISH = 3;

/** Prior strength: how many "neutral" reviews the average starts weighted with. */
const PRIOR_WEIGHT = 4;
const PRIOR_RATING = 3.8;

export interface ReviewInput {
  rating: number;
  qualityRating?: number | null;
  communicationRating?: number | null;
  timelinessRating?: number | null;
  authorId: string;
  createdAt: Date;
  isFlagged: boolean;
}

export interface WorkRecord {
  assignmentsStarted: number;
  assignmentsCompleted: number;
  assignmentsCancelledByWorker: number;
  assignmentsDeliveredOnTime: number;
  assignmentsWithDeadline: number;
  disputesRaisedAgainst: number;
  disputesLost: number;
  messagesReceived: number;
  messagesResponded: number;
  responseTimesMinutes: number[];
}

export interface ReputationResult {
  /** Null until MIN_REVIEWS_TO_PUBLISH is reached. */
  publishedRating: number | null;
  /** Smoothed internal value, always present, used for ranking. */
  internalRating: number;
  ratingCount: number;
  completionRate: number | null;
  cancellationRate: number | null;
  onTimeRate: number | null;
  responseRate: number | null;
  medianResponseMinutes: number | null;
  disputeRate: number | null;
  /** 0-100 composite used for ordering, never shown as a grade. */
  reliabilityScore: number;
  hasSufficientData: boolean;
  /** Human-readable statement of what the numbers rest on. */
  basis: string;
}

const pct = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : null;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2) * 100) / 100
    : (sorted[mid] as number);
}

/**
 * Recency weight. Halves roughly every six months, floored at 0.35 so a solid
 * history from a year ago still counts for something.
 */
function recencyWeight(createdAt: Date, now: Date): number {
  const days = (now.getTime() - createdAt.getTime()) / 86_400_000;
  return Math.max(0.35, Math.pow(0.5, days / 180));
}

export function computeReputation(
  reviews: ReviewInput[],
  work: WorkRecord,
  now = new Date(),
): ReputationResult {
  const usable = reviews.filter((r) => !r.isFlagged);

  // Weighted, smoothed average. The prior is what stops a single 1-star
  // review from reading as "this person is terrible".
  let weightedSum = PRIOR_RATING * PRIOR_WEIGHT;
  let weightTotal = PRIOR_WEIGHT;
  for (const review of usable) {
    const w = recencyWeight(review.createdAt, now);
    weightedSum += review.rating * w;
    weightTotal += w;
  }
  const internalRating = Math.round((weightedSum / weightTotal) * 100) / 100;

  const completionRate = pct(work.assignmentsCompleted, work.assignmentsStarted);
  const cancellationRate = pct(work.assignmentsCancelledByWorker, work.assignmentsStarted);
  const onTimeRate = pct(work.assignmentsDeliveredOnTime, work.assignmentsWithDeadline);
  const responseRate = pct(work.messagesResponded, work.messagesReceived);
  const disputeRate = pct(work.disputesRaisedAgainst, work.assignmentsStarted);

  const hasSufficientData = usable.length >= MIN_REVIEWS_TO_PUBLISH;

  // Reliability composite. Missing inputs fall back to neutral values so a new
  // worker starts mid-range rather than at zero.
  const reliabilityScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        (completionRate ?? 70) * 0.3 +
          (onTimeRate ?? 70) * 0.25 +
          (responseRate ?? 60) * 0.15 +
          (internalRating / 5) * 100 * 0.2 +
          Math.max(0, 100 - (cancellationRate ?? 0) * 2) * 0.1 -
          work.disputesLost * 5,
      ),
    ),
  );

  return {
    publishedRating: hasSufficientData ? internalRating : null,
    internalRating,
    ratingCount: usable.length,
    completionRate,
    cancellationRate,
    onTimeRate,
    responseRate,
    medianResponseMinutes: median(work.responseTimesMinutes),
    disputeRate,
    reliabilityScore,
    hasSufficientData,
    basis: hasSufficientData
      ? `Based on ${usable.length} review(s) and ${work.assignmentsCompleted} completed piece(s) of work.`
      : `Not enough reviews yet to publish a rating — ${usable.length} of ${MIN_REVIEWS_TO_PUBLISH} needed. This does not count against this worker.`,
  };
}

// ---------------------------------------------------------------------------
// Review manipulation detection
// ---------------------------------------------------------------------------

export interface ReviewManipulationSignal {
  rule: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
}

export interface ReviewContext {
  review: ReviewInput & { comment?: string | null; assignmentId?: string | null };
  /** Other reviews the same author has written. */
  authorHistory: Array<{ subjectUserId: string; rating: number; createdAt: Date }>;
  /** Other reviews the subject has received. */
  subjectHistory: Array<{ authorId: string; rating: number; createdAt: Date }>;
  /** Was there real, paid, approved work behind this review? */
  hasCompletedWork: boolean;
  /** Did these two parties also review each other? */
  isReciprocal: boolean;
  /** Accounts created within a short window of each other. */
  accountsCreatedCloseTogether: boolean;
}

/**
 * Flag reviews that look manipulated.
 *
 * Output is advisory: a flagged review is withheld from the published average
 * pending admin review. It is never deleted automatically, and it never
 * restricts an account on its own.
 */
export function detectReviewManipulation(ctx: ReviewContext): {
  suspicious: boolean;
  score: number;
  signals: ReviewManipulationSignal[];
} {
  const signals: ReviewManipulationSignal[] = [];

  if (!ctx.hasCompletedWork) {
    signals.push({
      rule: 'no_underlying_work',
      severity: 'HIGH',
      explanation: 'No completed, approved work links this reviewer to the person being reviewed.',
    });
  }

  // One author repeatedly reviewing the same person.
  const sameSubject = ctx.authorHistory.filter(
    (h) => h.subjectUserId === (ctx.review as { subjectUserId?: string }).subjectUserId,
  ).length;
  if (sameSubject >= 2) {
    signals.push({
      rule: 'repeat_reviewer',
      severity: 'MEDIUM',
      explanation: `This reviewer has already reviewed this person ${sameSubject} time(s).`,
    });
  }

  // An author whose every review is a 5 or every review is a 1.
  if (ctx.authorHistory.length >= 4) {
    const ratings = ctx.authorHistory.map((h) => h.rating);
    const allSame = ratings.every((r) => r === ratings[0]);
    if (allSame && (ratings[0] === 5 || ratings[0] === 1)) {
      signals.push({
        rule: 'uniform_rating_pattern',
        severity: 'MEDIUM',
        explanation: `Every one of this reviewer's ${ratings.length} reviews is ${ratings[0]} stars.`,
      });
    }
  }

  // A burst of reviews for one person in a short window.
  const recent = ctx.subjectHistory.filter(
    (h) => ctx.review.createdAt.getTime() - h.createdAt.getTime() < 24 * 3_600_000,
  );
  if (recent.length >= 3) {
    signals.push({
      rule: 'review_burst',
      severity: 'HIGH',
      explanation: `${recent.length} reviews were left for this person within 24 hours.`,
    });
  }

  if (ctx.accountsCreatedCloseTogether && !ctx.hasCompletedWork) {
    signals.push({
      rule: 'linked_accounts',
      severity: 'MEDIUM',
      explanation: 'Reviewer and subject accounts were created within a short window of each other.',
    });
  }

  // Reciprocal 5-star exchanges are normal after good work; they are only a
  // signal when there is no work behind them.
  if (ctx.isReciprocal && ctx.review.rating === 5 && !ctx.hasCompletedWork) {
    signals.push({
      rule: 'reciprocal_without_work',
      severity: 'MEDIUM',
      explanation: 'These two accounts reviewed each other five stars with no completed work between them.',
    });
  }

  const comment = ctx.review.comment?.trim() ?? '';
  if (ctx.review.rating === 5 && comment.length > 0 && comment.length < 12) {
    signals.push({
      rule: 'low_effort_praise',
      severity: 'LOW',
      explanation: 'Five-star rating with a near-empty comment.',
    });
  }

  const WEIGHT = { LOW: 10, MEDIUM: 25, HIGH: 40 } as const;
  const score = Math.min(100, signals.reduce((acc, s) => acc + WEIGHT[s.severity], 0));

  return { suspicious: score >= 40, score, signals };
}
