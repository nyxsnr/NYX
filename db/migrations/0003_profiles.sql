-- ===========================================================================
-- 0003_profiles
-- Worker profiles, companies, employer profiles, and the skill taxonomy.
--
-- Money is stored as bigint minor units (KES cents) plus an explicit currency
-- code. Floating point is never used for money anywhere in this schema.
-- ===========================================================================

CREATE TABLE skills (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  category      text        NOT NULL,     -- 'Customer Support', 'Data', 'Design', ...
  description   text,
  -- Aliases let CV extraction map "MS Excel", "Excel spreadsheets" -> excel.
  aliases       text[]      NOT NULL DEFAULT '{}',
  -- 0-100 signal of live employer demand, recomputed from job/task postings.
  demand_score  integer     NOT NULL DEFAULT 50 CHECK (demand_score BETWEEN 0 AND 100),
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_skills_category ON skills (category) WHERE is_active;
CREATE INDEX idx_skills_name_trgm ON skills USING gin (to_tsvector('english', name));
CREATE TRIGGER trg_skills_updated_at BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Worker profile
-- ---------------------------------------------------------------------------
CREATE TABLE worker_profiles (
  id                    uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid              NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Presentation
  photo_url             text,
  headline              text,
  summary               text,

  -- Location
  region_id             uuid              REFERENCES regions(id) ON DELETE SET NULL,
  town                  text,

  -- Background
  age_bracket           text              CHECK (age_bracket IN ('18-24','25-34','35-44','45-54','55+')),
  education_level       education_level,
  field_of_study        text,
  years_experience      integer           NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 60),
  employment_status     employment_status,
  languages             text[]            NOT NULL DEFAULT '{}',   -- ISO 639-1: en, sw, ...
  interests             text[]            NOT NULL DEFAULT '{}',

  -- Access to tools. This drives which work is realistically doable and is a
  -- first-class matching input, not a nice-to-have.
  has_smartphone        boolean           NOT NULL DEFAULT true,
  has_laptop            boolean           NOT NULL DEFAULT false,
  internet_access       text              NOT NULL DEFAULT 'MOBILE_DATA'
                          CHECK (internet_access IN ('NONE','OCCASIONAL','MOBILE_DATA','BROADBAND')),

  -- Work preferences
  desired_income_min    bigint            CHECK (desired_income_min >= 0),
  desired_income_max    bigint            CHECK (desired_income_max >= 0),
  income_period         text              NOT NULL DEFAULT 'MONTHLY'
                          CHECK (income_period IN ('HOURLY','DAILY','WEEKLY','MONTHLY','PER_TASK')),
  currency              char(3)           NOT NULL DEFAULT 'KES',
  preferred_work_types  employment_type[] NOT NULL DEFAULT '{}',
  work_arrangement      work_arrangement  NOT NULL DEFAULT 'ANY',
  willing_to_relocate   boolean           NOT NULL DEFAULT false,
  hours_per_week        integer           CHECK (hours_per_week BETWEEN 0 AND 80),
  available_from        date,
  is_available          boolean           NOT NULL DEFAULT true,

  -- "I don't know what I can do" — opts the worker into AI-led discovery.
  open_to_discovery     boolean           NOT NULL DEFAULT false,

  -- Cached scores. Source of truth is the readiness engine; these are a
  -- materialized snapshot so dashboards and matching stay fast.
  readiness_score       integer           NOT NULL DEFAULT 0 CHECK (readiness_score BETWEEN 0 AND 100),
  readiness_components  jsonb             NOT NULL DEFAULT '{}'::jsonb,
  readiness_computed_at timestamptz,
  profile_completion    integer           NOT NULL DEFAULT 0 CHECK (profile_completion BETWEEN 0 AND 100),

  -- Reputation snapshot (authoritative aggregation lives in reviews/tasks).
  jobs_completed        integer           NOT NULL DEFAULT 0,
  tasks_completed       integer           NOT NULL DEFAULT 0,
  completion_rate       numeric(5,2),
  cancellation_rate     numeric(5,2),
  on_time_rate          numeric(5,2),
  avg_rating            numeric(3,2)      CHECK (avg_rating IS NULL OR avg_rating BETWEEN 0 AND 5),
  rating_count          integer           NOT NULL DEFAULT 0,
  response_rate         numeric(5,2),
  avg_response_minutes  integer,
  total_earned          bigint            NOT NULL DEFAULT 0,

  -- Privacy. Defaults are conservative: exact location and phone are private.
  is_searchable         boolean           NOT NULL DEFAULT true,
  show_phone            boolean           NOT NULL DEFAULT false,
  show_exact_location   boolean           NOT NULL DEFAULT false,
  show_earnings         boolean           NOT NULL DEFAULT false,

  onboarding_step       text              NOT NULL DEFAULT 'BASICS',
  onboarding_completed_at timestamptz,

  created_at            timestamptz       NOT NULL DEFAULT now(),
  updated_at            timestamptz       NOT NULL DEFAULT now(),
  deleted_at            timestamptz,

  CONSTRAINT chk_income_range CHECK (
    desired_income_min IS NULL OR desired_income_max IS NULL
    OR desired_income_max >= desired_income_min
  )
);

CREATE INDEX idx_worker_profiles_region ON worker_profiles (region_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_worker_profiles_readiness ON worker_profiles (readiness_score DESC)
  WHERE deleted_at IS NULL AND is_searchable;
CREATE INDEX idx_worker_profiles_available ON worker_profiles (is_available, work_arrangement)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_worker_profiles_updated_at BEFORE UPDATE ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- worker_skills — the capability ledger.
-- A row records what was claimed, what was assessed, and on what evidence.
-- These three are deliberately separate columns; collapsing them would destroy
-- the product's core promise.
-- ---------------------------------------------------------------------------
CREATE TABLE worker_skills (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id   uuid           NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  skill_id            uuid           NOT NULL REFERENCES skills(id) ON DELETE CASCADE,

  self_reported_level skill_level,
  assessed_level      skill_level,
  evidence_level      evidence_level NOT NULL DEFAULT 'SELF_REPORTED',
  -- 0.00-1.00 model confidence. Only meaningful for AI_INFERRED rows.
  confidence          numeric(4,3)   CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  years_experience    integer        CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 60),

  -- Pointers to what backs the claim: simulation attempts, submissions, reviews.
  evidence            jsonb          NOT NULL DEFAULT '[]'::jsonb,
  source              text           NOT NULL DEFAULT 'ONBOARDING',  -- ONBOARDING | CV | SIMULATION | EMPLOYER | ADMIN
  last_verified_at    timestamptz,

  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),

  UNIQUE (worker_profile_id, skill_id)
);

CREATE INDEX idx_worker_skills_skill ON worker_skills (skill_id, evidence_level);
CREATE INDEX idx_worker_skills_profile ON worker_skills (worker_profile_id);
CREATE TRIGGER trg_worker_skills_updated_at BEFORE UPDATE ON worker_skills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Companies and employer profiles
-- ---------------------------------------------------------------------------
CREATE TABLE companies (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text    NOT NULL,
  slug                text    NOT NULL UNIQUE,
  description         text,
  industry            text,
  size_bracket        text    CHECK (size_bracket IN ('1-10','11-50','51-200','201-500','500+')),
  website             text,
  logo_url            text,
  region_id           uuid    REFERENCES regions(id) ON DELETE SET NULL,
  town                text,
  country_code        char(2) NOT NULL DEFAULT 'KE' REFERENCES countries(code),

  -- Registration identifiers are sensitive. They are stored for verification
  -- review only and are never returned by any public-facing serializer.
  registration_number text,
  tax_pin             text,

  verification_tier   employer_verification_tier NOT NULL DEFAULT 'UNVERIFIED',
  verified_at         timestamptz,

  total_spent         bigint  NOT NULL DEFAULT 0,
  jobs_posted         integer NOT NULL DEFAULT 0,
  tasks_posted        integer NOT NULL DEFAULT 0,
  hires_made          integer NOT NULL DEFAULT 0,
  avg_rating          numeric(3,2) CHECK (avg_rating IS NULL OR avg_rating BETWEEN 0 AND 5),
  rating_count        integer NOT NULL DEFAULT 0,
  avg_response_minutes integer,

  is_demo             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX idx_companies_verification ON companies (verification_tier) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE employer_profiles (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_id         uuid        REFERENCES companies(id) ON DELETE SET NULL,
  job_title          text,
  is_primary_contact boolean     NOT NULL DEFAULT true,
  onboarding_completed_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE INDEX idx_employer_profiles_company ON employer_profiles (company_id);
CREATE TRIGGER trg_employer_profiles_updated_at BEFORE UPDATE ON employer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Uploaded files. Bytes live in object storage; this table holds metadata and
-- ownership so authorization can be enforced before any download is served.
-- ---------------------------------------------------------------------------
CREATE TABLE files (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key   text        NOT NULL UNIQUE,
  provider      text        NOT NULL DEFAULT 'local',
  file_name     text        NOT NULL,
  content_type  text        NOT NULL,
  size_bytes    bigint      NOT NULL CHECK (size_bytes >= 0),
  checksum      text,
  purpose       text        NOT NULL,  -- 'cv' | 'portfolio' | 'task_brief' | 'submission' | 'verification' | 'avatar'
  is_public     boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX idx_files_owner ON files (owner_id, purpose) WHERE deleted_at IS NULL;

-- CV documents, plus whatever the extraction pipeline pulled out of them.
CREATE TABLE cv_documents (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_profile_id uuid        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  file_id           uuid        REFERENCES files(id) ON DELETE SET NULL,
  raw_text          text,
  parsed            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  parse_state       text        NOT NULL DEFAULT 'PENDING'
                      CHECK (parse_state IN ('PENDING','PARSING','PARSED','FAILED')),
  parse_error       text,
  is_primary        boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cv_documents_profile ON cv_documents (worker_profile_id, created_at DESC);
CREATE TRIGGER trg_cv_documents_updated_at BEFORE UPDATE ON cv_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
