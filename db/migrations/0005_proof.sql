-- ===========================================================================
-- 0005_proof
-- The proof-of-work system: simulation templates, attempts, portfolio items
-- and interview practice. This is where "what can this person reliably do?"
-- gets an evidence-backed answer.
-- ===========================================================================

-- A template is a structured brief the AI expands into a concrete exercise.
-- Templates are authored/reviewed by humans; only the instantiation is generated.
CREATE TABLE simulation_templates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text        NOT NULL UNIQUE,
  title             text        NOT NULL,
  category          text        NOT NULL,     -- 'Customer Support', 'Data', ...
  description       text        NOT NULL,
  -- Free-form scaffold the generator fills: scenario, persona, constraints.
  scenario_template jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Rubric criteria: [{key, label, description, weight, max_score}]
  rubric            jsonb       NOT NULL,
  response_format   text        NOT NULL DEFAULT 'TEXT'
                      CHECK (response_format IN ('TEXT','SPREADSHEET','FILE','STRUCTURED','MULTI_STEP')),
  difficulty        skill_level NOT NULL DEFAULT 'INTERMEDIATE',
  time_limit_minutes integer    NOT NULL DEFAULT 30 CHECK (time_limit_minutes > 0),
  -- Estimated minutes shown to the worker before they commit to starting.
  is_active         boolean     NOT NULL DEFAULT true,
  version           integer     NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sim_templates_category ON simulation_templates (category) WHERE is_active;
CREATE TRIGGER trg_sim_templates_updated_at BEFORE UPDATE ON simulation_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE simulation_template_skills (
  template_id uuid    NOT NULL REFERENCES simulation_templates(id) ON DELETE CASCADE,
  skill_id    uuid    NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  weight      numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
  PRIMARY KEY (template_id, skill_id)
);

-- A `simulation` is one concrete, generated instance of a template.
-- Instances are cached and reused across workers to control AI spend, but a
-- worker never sees the same instance twice within a template.
CREATE TABLE simulations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid        NOT NULL REFERENCES simulation_templates(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  brief         text        NOT NULL,     -- what the worker reads
  -- Structured materials: emails to triage, rows to clean, a customer message.
  materials     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  rubric        jsonb       NOT NULL,     -- snapshot of the template rubric at generation time
  -- Which model/prompt produced this instance, so results stay reproducible.
  generator_version text    NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_simulations_template ON simulations (template_id) WHERE is_active;

CREATE TABLE simulation_attempts (
  id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id     uuid             NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  template_id       uuid             NOT NULL REFERENCES simulation_templates(id) ON DELETE CASCADE,
  worker_profile_id uuid             NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,

  state             simulation_state NOT NULL DEFAULT 'STARTED',
  response          text,
  structured_response jsonb          NOT NULL DEFAULT '{}'::jsonb,
  response_file_id  uuid             REFERENCES files(id) ON DELETE SET NULL,

  -- Evaluation output. Every field here is evidence, retained verbatim.
  score             integer          CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  criterion_scores  jsonb            NOT NULL DEFAULT '[]'::jsonb,
  strengths         text[]           NOT NULL DEFAULT '{}',
  weaknesses        text[]           NOT NULL DEFAULT '{}',
  feedback          text,
  -- Which evaluator produced the score. Bump this when the rubric or model
  -- changes so historical scores remain interpretable.
  evaluator_version text,
  evaluated_at      timestamptz,

  started_at        timestamptz      NOT NULL DEFAULT now(),
  submitted_at      timestamptz,
  expires_at        timestamptz,
  time_spent_seconds integer         CHECK (time_spent_seconds IS NULL OR time_spent_seconds >= 0),

  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX idx_sim_attempts_worker ON simulation_attempts (worker_profile_id, state, created_at DESC);
CREATE INDEX idx_sim_attempts_template ON simulation_attempts (template_id, score DESC);
-- A worker may only have one live attempt per template at a time.
CREATE UNIQUE INDEX idx_sim_attempts_one_active
  ON simulation_attempts (worker_profile_id, template_id)
  WHERE state = 'STARTED';
CREATE TRIGGER trg_sim_attempts_updated_at BEFORE UPDATE ON simulation_attempts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Portfolio
-- ---------------------------------------------------------------------------
CREATE TABLE portfolio_items (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id uuid           NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  title             text           NOT NULL,
  description       text,
  kind              text           NOT NULL DEFAULT 'DOCUMENT'
                      CHECK (kind IN ('IMAGE','DOCUMENT','WEBSITE','GITHUB','VIDEO','TEXT')),
  external_url      text,
  file_id           uuid           REFERENCES files(id) ON DELETE SET NULL,
  completed_on      date,
  -- Self-reported by default; upgraded only when a real source backs it up.
  evidence_level    evidence_level NOT NULL DEFAULT 'SELF_REPORTED',
  -- Set when the item was produced by approved paid work on the platform.
  source_submission_id uuid        REFERENCES work_submissions(id) ON DELETE SET NULL,
  display_order     integer        NOT NULL DEFAULT 0,
  is_public         boolean        NOT NULL DEFAULT true,
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX idx_portfolio_worker ON portfolio_items (worker_profile_id, display_order)
  WHERE deleted_at IS NULL;
CREATE TRIGGER trg_portfolio_updated_at BEFORE UPDATE ON portfolio_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE portfolio_item_skills (
  item_id  uuid NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, skill_id)
);

-- ---------------------------------------------------------------------------
-- Interview simulator
-- ---------------------------------------------------------------------------
CREATE TABLE interview_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id uuid        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  -- Optional: practising for a specific posted job.
  job_id            uuid        REFERENCES jobs(id) ON DELETE SET NULL,
  role_title        text        NOT NULL,
  interview_kind    text        NOT NULL DEFAULT 'MIXED'
                      CHECK (interview_kind IN ('BEHAVIOURAL','TECHNICAL','MIXED','SCREENING')),
  state             text        NOT NULL DEFAULT 'IN_PROGRESS'
                      CHECK (state IN ('IN_PROGRESS','COMPLETED','ABANDONED')),
  -- Ordered transcript: [{role: 'interviewer'|'candidate', content, at}]
  transcript        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  question_count    integer     NOT NULL DEFAULT 0,
  overall_score     integer     CHECK (overall_score IS NULL OR overall_score BETWEEN 0 AND 100),
  dimension_scores  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  strengths         text[]      NOT NULL DEFAULT '{}',
  improvements      text[]      NOT NULL DEFAULT '{}',
  feedback          text,
  evaluator_version text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interviews_worker ON interview_sessions (worker_profile_id, created_at DESC);
CREATE TRIGGER trg_interviews_updated_at BEFORE UPDATE ON interview_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
