-- ===========================================================================
-- 0007_trust
-- Reviews, disputes and fraud signals.
--
-- Design constraint from the product brief: one bad rating must not destroy a
-- person's livelihood. Aggregates are therefore only published once a
-- sufficient-data threshold is met, and every flag is advisory until a human
-- reviews it. Nothing in this schema bans anyone automatically.
-- ===========================================================================

CREATE TABLE reviews (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who is being reviewed, and in which direction.
  subject_kind      review_subject NOT NULL,
  subject_user_id   uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id         uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Reviews must be anchored to real work. A review with neither anchor is
  -- rejected by the CHECK below, which kills the easiest review-spam vector.
  assignment_id     uuid           REFERENCES task_assignments(id) ON DELETE SET NULL,
  application_id    uuid           REFERENCES applications(id) ON DELETE SET NULL,
  task_id           uuid           REFERENCES tasks(id) ON DELETE SET NULL,
  job_id            uuid           REFERENCES jobs(id) ON DELETE SET NULL,

  rating            integer        NOT NULL CHECK (rating BETWEEN 1 AND 5),
  quality_rating    integer        CHECK (quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5),
  communication_rating integer     CHECK (communication_rating IS NULL OR communication_rating BETWEEN 1 AND 5),
  timeliness_rating integer        CHECK (timeliness_rating IS NULL OR timeliness_rating BETWEEN 1 AND 5),
  comment           text,

  is_published      boolean        NOT NULL DEFAULT true,
  -- Set when heuristics suspect manipulation. Suppresses the review from
  -- aggregates until an admin decides; it does not delete anything.
  is_flagged        boolean        NOT NULL DEFAULT false,
  flag_reason       text,
  moderated_by      uuid           REFERENCES users(id) ON DELETE SET NULL,
  moderated_at      timestamptz,

  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),
  deleted_at        timestamptz,

  CONSTRAINT chk_review_anchored CHECK (
    assignment_id IS NOT NULL OR application_id IS NOT NULL
  ),
  CONSTRAINT chk_review_not_self CHECK (author_id <> subject_user_id)
);

-- One review per author per piece of work.
CREATE UNIQUE INDEX idx_reviews_unique_assignment
  ON reviews (author_id, assignment_id) WHERE assignment_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_reviews_unique_application
  ON reviews (author_id, application_id) WHERE application_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_reviews_subject ON reviews (subject_user_id, created_at DESC)
  WHERE deleted_at IS NULL AND is_published AND NOT is_flagged;
CREATE INDEX idx_reviews_flagged ON reviews (is_flagged, created_at DESC) WHERE is_flagged;
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------
CREATE TABLE disputes (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text           NOT NULL UNIQUE,
  assignment_id   uuid           REFERENCES task_assignments(id) ON DELETE SET NULL,
  task_id         uuid           REFERENCES tasks(id) ON DELETE SET NULL,
  payment_id      uuid           REFERENCES payments(id) ON DELETE SET NULL,

  raised_by       uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  against_user_id uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          text           NOT NULL,
  details         text           NOT NULL,
  evidence        jsonb          NOT NULL DEFAULT '[]'::jsonb,

  status          dispute_status NOT NULL DEFAULT 'OPEN',
  -- Resolutions are always attributed to a named admin. No automated verdicts.
  resolved_by     uuid           REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes text,
  worker_amount   bigint         CHECK (worker_amount IS NULL OR worker_amount >= 0),
  employer_amount bigint         CHECK (employer_amount IS NULL OR employer_amount >= 0),
  resolved_at     timestamptz,

  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_disputes_status ON disputes (status, created_at DESC);
CREATE INDEX idx_disputes_parties ON disputes (raised_by, against_user_id);
CREATE TRIGGER trg_disputes_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Fraud flags — advisory signals for human review.
-- ---------------------------------------------------------------------------
CREATE TABLE fraud_flags (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What was flagged. Nullable user_id because jobs/tasks can be flagged too.
  user_id       uuid           REFERENCES users(id) ON DELETE CASCADE,
  entity_type   text           NOT NULL,   -- 'user' | 'job' | 'task' | 'review' | 'application'
  entity_id     text,

  rule          text           NOT NULL,   -- e.g. 'duplicate_account.device_fingerprint'
  severity      fraud_severity NOT NULL DEFAULT 'LOW',
  score         integer        CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  reason        text           NOT NULL,
  signals       jsonb          NOT NULL DEFAULT '{}'::jsonb,
  -- 'heuristic' | 'ai' | 'report' | 'manual'. AI signals are never sufficient
  -- on their own to restrict an account.
  detected_by   text           NOT NULL DEFAULT 'heuristic',

  state         fraud_state    NOT NULL DEFAULT 'OPEN',
  reviewed_by   uuid           REFERENCES users(id) ON DELETE SET NULL,
  review_notes  text,
  reviewed_at   timestamptz,

  created_at    timestamptz    NOT NULL DEFAULT now(),
  updated_at    timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_fraud_open ON fraud_flags (state, severity, created_at DESC) WHERE state = 'OPEN';
CREATE INDEX idx_fraud_user ON fraud_flags (user_id, created_at DESC);
CREATE INDEX idx_fraud_entity ON fraud_flags (entity_type, entity_id);
CREATE TRIGGER trg_fraud_updated_at BEFORE UPDATE ON fraud_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- User-submitted reports (a worker reporting a fake job, etc.).
CREATE TABLE reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type   text        NOT NULL,
  entity_id     text        NOT NULL,
  category      text        NOT NULL,   -- 'FAKE_JOB' | 'SCAM' | 'HARASSMENT' | 'SPAM' | 'OTHER'
  details       text        NOT NULL,
  state         fraud_state NOT NULL DEFAULT 'OPEN',
  reviewed_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
  review_notes  text,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_open ON reports (state, created_at DESC);
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
