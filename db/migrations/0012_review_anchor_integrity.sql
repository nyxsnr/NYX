-- ===========================================================================
-- 0012_review_anchor_integrity
--
-- Fixes a real integrity hole in 0007: `reviews.assignment_id` and
-- `reviews.application_id` were declared ON DELETE SET NULL, while
-- `chk_review_anchored` requires at least one of them to be non-null.
--
-- Deleting the underlying assignment therefore tried to null the anchor and
-- violated the table's own CHECK constraint — the delete failed, and the
-- database was left in a state where removing a task could not be completed.
--
-- The correct semantics: a review only means something because it is attached
-- to real, completed work. If that work record is removed, the review has no
-- basis and must go with it. So both anchors cascade.
-- ===========================================================================

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_assignment_id_fkey;
ALTER TABLE reviews
  ADD CONSTRAINT reviews_assignment_id_fkey
  FOREIGN KEY (assignment_id) REFERENCES task_assignments(id) ON DELETE CASCADE;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_application_id_fkey;
ALTER TABLE reviews
  ADD CONSTRAINT reviews_application_id_fkey
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;

-- Disputes carry the same shape: a dispute is about a specific assignment, and
-- `resolution` is meaningless without it. Cascade rather than orphan.
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_assignment_id_fkey;
ALTER TABLE disputes
  ADD CONSTRAINT disputes_assignment_id_fkey
  FOREIGN KEY (assignment_id) REFERENCES task_assignments(id) ON DELETE CASCADE;
