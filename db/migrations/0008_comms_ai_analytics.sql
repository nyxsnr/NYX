-- ===========================================================================
-- 0008_comms_ai_analytics
-- Messaging, notifications, AI outputs and the analytics event stream.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Messaging. Conversations are always anchored to a job or task so the
-- platform can enforce "communicate through approved channels" and so that
-- contact-details leakage can be detected before work is agreed.
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid        REFERENCES tasks(id) ON DELETE CASCADE,
  job_id        uuid        REFERENCES jobs(id) ON DELETE CASCADE,
  subject       text,
  last_message_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_conversation_anchored CHECK (task_id IS NOT NULL OR job_id IS NOT NULL)
);

CREATE TABLE conversation_participants (
  conversation_id uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_conv_participants_user ON conversation_participants (user_id);

CREATE TABLE messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            text        NOT NULL,
  file_id         uuid        REFERENCES files(id) ON DELETE SET NULL,
  -- Raised when the body looks like an attempt to move the deal off-platform
  -- or to phish. Advisory: the message still sends, an admin reviews it.
  is_flagged      boolean     NOT NULL DEFAULT false,
  flag_reason     text,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_messages_flagged ON messages (is_flagged, created_at DESC) WHERE is_flagged;

-- ---------------------------------------------------------------------------
-- Notifications. Channel is an enum so SMS/WhatsApp can be switched on later
-- without a migration — only a provider implementation is missing.
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id            uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel       notification_channel NOT NULL DEFAULT 'IN_APP',
  kind          text                 NOT NULL,   -- 'application.shortlisted', 'payment.released', ...
  title         text                 NOT NULL,
  body          text                 NOT NULL,
  action_url    text,
  payload       jsonb                NOT NULL DEFAULT '{}'::jsonb,
  state         notification_state   NOT NULL DEFAULT 'QUEUED',
  error         text,
  sent_at       timestamptz,
  read_at       timestamptz,
  created_at    timestamptz          NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_queued ON notifications (state, created_at) WHERE state = 'QUEUED';

-- ---------------------------------------------------------------------------
-- AI outputs. Every model call that produces a durable judgement is recorded
-- here with its model, prompt version and validated payload, so any score
-- shown to a user can be traced back to what produced it.
-- ---------------------------------------------------------------------------
CREATE TABLE ai_assessments (
  id                uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              ai_assessment_kind NOT NULL,
  subject_user_id   uuid               REFERENCES users(id) ON DELETE CASCADE,
  worker_profile_id uuid               REFERENCES worker_profiles(id) ON DELETE CASCADE,
  entity_type       text,
  entity_id         text,

  -- Validated model output. Nothing is written here that failed schema checks.
  result            jsonb              NOT NULL,
  -- Overall confidence, where the task produces one.
  confidence        numeric(4,3)       CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),

  provider          text               NOT NULL,
  model             text               NOT NULL,
  prompt_version    text               NOT NULL,
  input_digest      text,              -- sha256 of the input, for cache/dedupe
  latency_ms        integer,
  input_tokens      integer,
  output_tokens     integer,

  -- Human override. An AI judgement is a proposal until someone accepts it.
  reviewed_by       uuid               REFERENCES users(id) ON DELETE SET NULL,
  review_state      text               NOT NULL DEFAULT 'UNREVIEWED'
                      CHECK (review_state IN ('UNREVIEWED','ACCEPTED','OVERRIDDEN','REJECTED')),
  review_notes      text,
  reviewed_at       timestamptz,

  created_at        timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_assessments_worker ON ai_assessments (worker_profile_id, kind, created_at DESC);
CREATE INDEX idx_ai_assessments_entity ON ai_assessments (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_ai_assessments_digest ON ai_assessments (kind, input_digest);

CREATE TABLE ai_recommendations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id uuid        REFERENCES worker_profiles(id) ON DELETE CASCADE,
  company_id        uuid        REFERENCES companies(id) ON DELETE CASCADE,
  kind              text        NOT NULL,   -- 'JOB' | 'TASK' | 'SIMULATION' | 'SKILL' | 'CAREER_PATH' | 'CANDIDATE'
  entity_type       text,
  entity_id         text,
  score             integer     CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  -- Human-readable justification. A recommendation without reasons is a bug.
  reasons           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  gaps              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  payload           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dismissed_at      timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_recs_worker ON ai_recommendations (worker_profile_id, kind, score DESC)
  WHERE dismissed_at IS NULL;
CREATE INDEX idx_ai_recs_company ON ai_recommendations (company_id, kind, score DESC)
  WHERE dismissed_at IS NULL;

-- Per-user AI usage, for cost control and abuse limits.
CREATE TABLE ai_usage (
  id            bigserial   PRIMARY KEY,
  user_id       uuid        REFERENCES users(id) ON DELETE CASCADE,
  operation     text        NOT NULL,
  provider      text        NOT NULL,
  model         text        NOT NULL,
  input_tokens  integer     NOT NULL DEFAULT 0,
  output_tokens integer     NOT NULL DEFAULT 0,
  latency_ms    integer,
  succeeded     boolean     NOT NULL DEFAULT true,
  error_code    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_user_day ON ai_usage (user_id, created_at DESC);

-- Career Agent conversations.
CREATE TABLE agent_conversations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             text,
  messages          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  message_count     integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_conv_user ON agent_conversations (user_id, updated_at DESC);
CREATE TRIGGER trg_agent_conv_updated_at BEFORE UPDATE ON agent_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Analytics. The table is the source of truth; PostHog is an optional mirror.
-- The North Star (income generated for workers) is computed from the ledger,
-- not from events, so it can never drift from the money that actually moved.
-- ---------------------------------------------------------------------------
CREATE TABLE analytics_events (
  id            bigserial   PRIMARY KEY,
  event         text        NOT NULL,
  user_id       uuid        REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id  text,
  role          user_role,
  entity_type   text,
  entity_id     text,
  properties    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  session_id    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_name_time ON analytics_events (event, created_at DESC);
CREATE INDEX idx_events_user_time ON analytics_events (user_id, created_at DESC);
CREATE INDEX idx_events_entity ON analytics_events (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Embeddings for semantic matching.
--
-- Stored as float8[] so the schema works on any PostgreSQL. Migration 0009
-- upgrades this to a native pgvector column with an HNSW index wherever the
-- extension is available (it is, on Supabase). See docs/ARCHITECTURE.md.
-- ---------------------------------------------------------------------------
CREATE TABLE embeddings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text        NOT NULL,   -- 'worker' | 'job' | 'task' | 'skill'
  entity_id     uuid        NOT NULL,
  content_hash  text        NOT NULL,
  embedding     float8[]    NOT NULL,
  dimensions    integer     NOT NULL,
  model         text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX idx_embeddings_entity ON embeddings (entity_type);
CREATE TRIGGER trg_embeddings_updated_at BEFORE UPDATE ON embeddings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
