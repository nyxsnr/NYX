-- ===========================================================================
-- 0002_identity
-- Users, sessions, verification, audit log.
-- Password hashes and session tokens never leave this schema in plaintext.
-- ===========================================================================

CREATE TABLE users (
  id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text           NOT NULL,
  email_normalized   text           NOT NULL,      -- lower(trim(email)); uniqueness key
  password_hash      text           NOT NULL,      -- scrypt: scrypt$N$r$p$salt$hash
  role               user_role      NOT NULL,
  status             account_status NOT NULL DEFAULT 'PENDING',

  full_name          text           NOT NULL,
  phone              text,                          -- E.164, e.g. +254712345678
  phone_normalized   text,
  locale             text           NOT NULL DEFAULT 'en',  -- 'en' | 'sw'
  country_code       char(2)        NOT NULL DEFAULT 'KE' REFERENCES countries(code),

  email_verified_at  timestamptz,
  phone_verified_at  timestamptz,
  last_login_at      timestamptz,
  failed_login_count integer        NOT NULL DEFAULT 0,
  locked_until       timestamptz,

  -- Demo accounts are visibly flagged so nobody mistakes seed data for real users.
  is_demo            boolean        NOT NULL DEFAULT false,

  created_at         timestamptz    NOT NULL DEFAULT now(),
  updated_at         timestamptz    NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

-- Uniqueness is on the normalized form and ignores soft-deleted rows so a
-- closed account does not permanently burn an email address.
CREATE UNIQUE INDEX idx_users_email_unique
  ON users (email_normalized) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_phone_unique
  ON users (phone_normalized) WHERE phone_normalized IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_users_role_status ON users (role, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created_at ON users (created_at DESC);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Sessions. Only a SHA-256 hash of the token is stored: a database leak must
-- not hand an attacker usable session cookies.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     text        NOT NULL UNIQUE,
  ip_address     inet,
  user_agent     text,
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expiry ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Verification records: email, phone, business registration, identity.
-- `evidence` holds references to uploaded documents, never raw document bytes.
-- ---------------------------------------------------------------------------
CREATE TABLE verification_records (
  id             uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           verification_kind  NOT NULL,
  state          verification_state NOT NULL DEFAULT 'PENDING',
  -- One-time codes are hashed, exactly like session tokens.
  code_hash      text,
  attempts       integer            NOT NULL DEFAULT 0,
  evidence       jsonb              NOT NULL DEFAULT '{}'::jsonb,
  reviewer_id    uuid               REFERENCES users(id) ON DELETE SET NULL,
  reviewer_notes text,
  expires_at     timestamptz,
  verified_at    timestamptz,
  created_at     timestamptz        NOT NULL DEFAULT now(),
  updated_at     timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_user_kind ON verification_records (user_id, kind, state);
CREATE INDEX idx_verification_pending ON verification_records (state, created_at DESC)
  WHERE state = 'PENDING';

CREATE TRIGGER trg_verification_updated_at BEFORE UPDATE ON verification_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log — append-only record of privileged and money-moving actions.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id           bigserial   PRIMARY KEY,
  actor_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  actor_role   user_role,
  action       text        NOT NULL,             -- e.g. 'payment.release'
  entity_type  text        NOT NULL,
  entity_id    text,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_address   inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor ON audit_log (actor_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log (action, created_at DESC);

-- ---------------------------------------------------------------------------
-- Rate limiting counters. Durable so limits survive a serverless cold start;
-- swap for Redis when traffic justifies it (see docs/SECURITY.md).
-- ---------------------------------------------------------------------------
CREATE TABLE rate_limits (
  bucket       text        NOT NULL,   -- e.g. 'login:203.0.113.9'
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);
