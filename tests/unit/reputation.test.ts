import { describe, expect, it } from 'vitest';
import {
  computeReputation,
  detectReviewManipulation,
  MIN_REVIEWS_TO_PUBLISH,
  type ReviewInput,
  type WorkRecord,
} from '@/lib/reputation';

const now = new Date('2026-06-01T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

const review = (rating: number, days = 10, authorId = 'a1'): ReviewInput => ({
  rating, authorId, createdAt: daysAgo(days), isFlagged: false,
});

const emptyWork: WorkRecord = {
  assignmentsStarted: 0, assignmentsCompleted: 0, assignmentsCancelledByWorker: 0,
  assignmentsDeliveredOnTime: 0, assignmentsWithDeadline: 0,
  disputesRaisedAgainst: 0, disputesLost: 0,
  messagesReceived: 0, messagesResponded: 0, responseTimesMinutes: [],
};

describe('reputation engine', () => {
  it('withholds a published rating below the sufficient-data threshold', () => {
    const result = computeReputation([review(5), review(4)], emptyWork, now);
    expect(result.ratingCount).toBe(2);
    expect(result.publishedRating).toBeNull();
    expect(result.hasSufficientData).toBe(false);
    expect(result.basis).toContain('not count against');
  });

  it('publishes once enough reviews exist', () => {
    const reviews = Array.from({ length: MIN_REVIEWS_TO_PUBLISH }, (_, i) => review(5, 5, `a${i}`));
    expect(computeReputation(reviews, emptyWork, now).publishedRating).not.toBeNull();
  });

  it('does not let one bad review destroy a good record', () => {
    const good = Array.from({ length: 9 }, (_, i) => review(5, 20, `a${i}`));
    const before = computeReputation(good, emptyWork, now).internalRating;
    const after = computeReputation([...good, review(1, 1, 'bad')], emptyWork, now).internalRating;
    expect(before - after).toBeLessThan(0.6);
    expect(after).toBeGreaterThan(4);
  });

  it('smooths a lone one-star toward the neutral prior', () => {
    const result = computeReputation([review(1)], emptyWork, now);
    // Not 1.0 — a single data point cannot define someone.
    expect(result.internalRating).toBeGreaterThan(2.5);
  });

  it('excludes flagged reviews from aggregates', () => {
    const clean = computeReputation([review(5), review(5), review(5)], emptyWork, now);
    const withFlagged = computeReputation(
      [review(5), review(5), review(5), { ...review(1), isFlagged: true }],
      emptyWork,
      now,
    );
    expect(withFlagged.ratingCount).toBe(clean.ratingCount);
    expect(withFlagged.internalRating).toBeCloseTo(clean.internalRating, 5);
  });

  it('computes rates only where there is a denominator', () => {
    const result = computeReputation([], emptyWork, now);
    expect(result.completionRate).toBeNull();
    expect(result.onTimeRate).toBeNull();
    // Still gives a usable ordering value for a brand-new worker.
    expect(result.reliabilityScore).toBeGreaterThan(0);
  });

  it('computes rates correctly with real work history', () => {
    const result = computeReputation([review(4), review(5), review(4)], {
      ...emptyWork,
      assignmentsStarted: 10, assignmentsCompleted: 9, assignmentsCancelledByWorker: 1,
      assignmentsWithDeadline: 8, assignmentsDeliveredOnTime: 7,
      messagesReceived: 20, messagesResponded: 18,
      responseTimesMinutes: [10, 30, 45, 120],
    }, now);

    expect(result.completionRate).toBe(90);
    expect(result.cancellationRate).toBe(10);
    expect(result.onTimeRate).toBe(87.5);
    expect(result.responseRate).toBe(90);
    expect(result.medianResponseMinutes).toBe(37.5);
  });

  it('weights recent reviews above old ones', () => {
    const recentGood = computeReputation([review(5, 1, 'a'), review(2, 400, 'b')], emptyWork, now);
    const recentBad = computeReputation([review(2, 1, 'a'), review(5, 400, 'b')], emptyWork, now);
    expect(recentGood.internalRating).toBeGreaterThan(recentBad.internalRating);
  });
});

describe('review manipulation detection', () => {
  const baseCtx = {
    review: { ...review(5), comment: 'Great work, delivered on time and communicated well.' },
    authorHistory: [],
    subjectHistory: [],
    hasCompletedWork: true,
    isReciprocal: false,
    accountsCreatedCloseTogether: false,
  };

  it('passes a legitimate review', () => {
    const result = detectReviewManipulation(baseCtx);
    expect(result.suspicious).toBe(false);
    expect(result.score).toBeLessThan(40);
  });

  it('flags a review with no underlying work', () => {
    const result = detectReviewManipulation({ ...baseCtx, hasCompletedWork: false });
    expect(result.suspicious).toBe(true);
    expect(result.signals.some((s) => s.rule === 'no_underlying_work')).toBe(true);
  });

  it('flags a burst of reviews in one day', () => {
    const result = detectReviewManipulation({
      ...baseCtx,
      subjectHistory: Array.from({ length: 4 }, (_, i) => ({
        authorId: `a${i}`, rating: 5, createdAt: new Date(baseCtx.review.createdAt.getTime() - 3_600_000),
      })),
    });
    expect(result.signals.some((s) => s.rule === 'review_burst')).toBe(true);
  });

  it('explains every signal it raises', () => {
    const result = detectReviewManipulation({ ...baseCtx, hasCompletedWork: false });
    for (const signal of result.signals) {
      expect(signal.explanation.length).toBeGreaterThan(15);
    }
  });
});
