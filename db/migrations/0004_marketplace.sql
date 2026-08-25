-- ===========================================================================
-- 0004_marketplace
-- Jobs, tasks, applications, projects and work submissions.
-- ===========================================================================

CREATE TABLE jobs (
  id                  uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid             NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  posted_by           uuid             NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  title               text             NOT NULL,
  slug                text             NOT NULL,
  description         text             NOT NULL,
  responsibilities    text,
  category            text             NOT NULL,

  region_id           uuid             REFERENCES regions(id) ON DELETE SET NULL,
  town                text,
  country_code        char(2)          NOT NULL DEFAULT 'KE' REFERENCES countries(code),
  work_arrangement    work_arrangement NOT NULL DEFAULT 'ONSITE',
  employment_type     employment_type  NOT NULL,

  salary_min          bigint           CHECK (salary_min >= 0),
  salary_max          bigint           CHECK (salary_max >= 0),
  salary_period       text             NOT NULL DEFAULT 'MONTHLY'
                        CHECK (salary_period IN ('HOURLY','DAILY','WEEKLY','MONTHLY','ANNUAL')),
  currency            char(3)          NOT NULL DEFAULT 'KES',
  salary_is_public    boolean          NOT NULL DEFAULT true,

  min_education       education_level,
  min_years_experience integer         NOT NULL DEFAULT 0 CHECK (min_years_experience BETWEEN 0 AND 40),
  languages_required  text[]           NOT NULL DEFAULT '{}',

  openings            integer          NOT NULL DEFAULT 1 CHECK (openings > 0),
  deadline            date,
  -- Employer-authored screening questions: [{id, prompt, type, required, options}]
  application_questions jsonb          NOT NULL DEFAULT '[]'::jsonb,

  status              job_status       NOT NULL DEFAULT 'DRAFT',
  published_at        timestamptz,
  closed_at           timestamptz,
  -- True when a model drafted or rewrote the description. Surfaced in admin
  -- review; AI-drafted copy is never silently presented as human-written.
  ai_assisted         boolean          NOT NULL DEFAULT false,

  view_count          integer          NOT NULL DEFAULT 0,
  application_count   integer          NOT NULL DEFAULT 0,

  moderation_notes    text,
  is_demo             boolean          NOT NULL DEFAULT false,
  created_at          timestamptz      NOT NULL DEFAULT now(),
  updated_at          timestamptz      NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  CONSTRAINT chk_job_salary_range CHECK (
    salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min
  ),
  UNIQUE (company_id, slug)
);

CREATE INDEX idx_jobs_published ON jobs (status, published_at DESC)
  WHERE deleted_at IS NULL AND status = 'PUBLISHED';
CREATE INDEX idx_jobs_company ON jobs (company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_region ON jobs (region_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_category ON jobs (category) WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_search ON jobs
  USING gin (to_tsvector('english', title || ' ' || description));
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE job_skills (
  job_id      uuid    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id    uuid    NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT true,
  min_level   skill_level,
  weight      numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
  PRIMARY KEY (job_id, skill_id)
);

CREATE INDEX idx_job_skills_skill ON job_skills (skill_id, is_required);

-- ---------------------------------------------------------------------------
-- Applications to jobs
-- ---------------------------------------------------------------------------
CREATE TABLE applications (
  id                uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid               NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_profile_id uuid               NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,

  cover_note        text,
  answers           jsonb              NOT NULL DEFAULT '[]'::jsonb,
  cv_file_id        uuid               REFERENCES files(id) ON DELETE SET NULL,

  status            application_status NOT NULL DEFAULT 'SUBMITTED',
  -- Match score at submission time, with the human-readable reasons that
  -- produced it. Stored so a decision can always be explained after the fact.
  match_score       integer            CHECK (match_score BETWEEN 0 AND 100),
  match_explanation jsonb              NOT NULL DEFAULT '{}'::jsonb,

  employer_notes    text,
  rejection_reason  text,
  -- A model may rank and explain, but a human always makes the call.
  decided_by        uuid               REFERENCES users(id) ON DELETE SET NULL,
  viewed_at         timestamptz,
  shortlisted_at    timestamptz,
  decided_at        timestamptz,
  withdrawn_at      timestamptz,

  created_at        timestamptz        NOT NULL DEFAULT now(),
  updated_at        timestamptz        NOT NULL DEFAULT now(),

  UNIQUE (job_id, worker_profile_id)
);

CREATE INDEX idx_applications_job ON applications (job_id, status, match_score DESC);
CREATE INDEX idx_applications_worker ON applications (worker_profile_id, created_at DESC);
CREATE TRIGGER trg_applications_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Task marketplace
-- ---------------------------------------------------------------------------
CREATE TABLE tasks (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  posted_by           uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id          uuid,       -- FK added after projects table exists

  title               text        NOT NULL,
  description         text        NOT NULL,
  category            text        NOT NULL,
  expected_output     text        NOT NULL,
  quality_requirements text,

  budget_amount       bigint      NOT NULL CHECK (budget_amount > 0),
  currency            char(3)     NOT NULL DEFAULT 'KES',
  -- Fixed price per worker, or per unit of delivered work.
  pricing_model       text        NOT NULL DEFAULT 'FIXED'
                        CHECK (pricing_model IN ('FIXED','PER_UNIT')),
  unit_label          text,
  unit_count          integer     CHECK (unit_count IS NULL OR unit_count > 0),

  workers_needed      integer     NOT NULL DEFAULT 1 CHECK (workers_needed > 0),
  workers_assigned    integer     NOT NULL DEFAULT 0 CHECK (workers_assigned >= 0),
  estimated_hours     numeric(6,2) CHECK (estimated_hours IS NULL OR estimated_hours > 0),
  deadline            timestamptz,

  -- Most tasks are remote-capable; a location restriction is the exception.
  requires_location   boolean     NOT NULL DEFAULT false,
  region_id           uuid        REFERENCES regions(id) ON DELETE SET NULL,
  country_code        char(2)     NOT NULL DEFAULT 'KE' REFERENCES countries(code),
  requires_laptop     boolean     NOT NULL DEFAULT false,

  status              task_status NOT NULL DEFAULT 'DRAFT',
  published_at        timestamptz,
  completed_at        timestamptz,
  ai_assisted         boolean     NOT NULL DEFAULT false,
  ai_decomposed       boolean     NOT NULL DEFAULT false,

  view_count          integer     NOT NULL DEFAULT 0,
  application_count   integer     NOT NULL DEFAULT 0,

  moderation_notes    text,
  is_demo             boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX idx_tasks_published ON tasks (status, published_at DESC)
  WHERE deleted_at IS NULL AND status = 'PUBLISHED';
CREATE INDEX idx_tasks_company ON tasks (company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_category ON tasks (category) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_deadline ON tasks (deadline) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_search ON tasks
  USING gin (to_tsvector('english', title || ' ' || description));
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE task_skills (
  task_id     uuid    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  skill_id    uuid    NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT true,
  min_level   skill_level,
  weight      numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
  PRIMARY KEY (task_id, skill_id)
);

CREATE INDEX idx_task_skills_skill ON task_skills (skill_id, is_required);

-- Employer-supplied briefs, datasets and reference material.
CREATE TABLE task_files (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, file_id)
);

CREATE TABLE task_applications (
  id                uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid                    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_profile_id uuid                    NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,

  proposal          text,
  -- What the worker asks for; may differ from the posted budget.
  bid_amount        bigint                  CHECK (bid_amount IS NULL OR bid_amount > 0),
  estimated_days    integer                 CHECK (estimated_days IS NULL OR estimated_days > 0),
  -- Flagged when the Career Agent helped draft the proposal. The agent may
  -- improve wording; it may never invent experience.
  ai_assisted       boolean                 NOT NULL DEFAULT false,

  status            task_application_status NOT NULL DEFAULT 'SUBMITTED',
  match_score       integer                 CHECK (match_score BETWEEN 0 AND 100),
  match_explanation jsonb                   NOT NULL DEFAULT '{}'::jsonb,

  decided_by        uuid                    REFERENCES users(id) ON DELETE SET NULL,
  decided_at        timestamptz,
  created_at        timestamptz             NOT NULL DEFAULT now(),
  updated_at        timestamptz             NOT NULL DEFAULT now(),

  UNIQUE (task_id, worker_profile_id)
);

CREATE INDEX idx_task_apps_task ON task_applications (task_id, status, match_score DESC);
CREATE INDEX idx_task_apps_worker ON task_applications (worker_profile_id, created_at DESC);
CREATE TRIGGER trg_task_apps_updated_at BEFORE UPDATE ON task_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects — the container produced by AI task decomposition. An employer
-- describes an outcome ("manage my restaurant's social media"); the system
-- proposes constituent tasks, which the employer approves before publishing.
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by       uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title            text        NOT NULL,
  brief            text        NOT NULL,
  total_budget     bigint      CHECK (total_budget IS NULL OR total_budget >= 0),
  currency         char(3)     NOT NULL DEFAULT 'KES',
  status           text        NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','PROPOSED','APPROVED','ACTIVE','COMPLETED','CANCELLED')),
  -- The raw decomposition proposal, kept for audit and for re-proposal.
  ai_proposal      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  approved_at      timestamptz,
  approved_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
  is_demo          boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX idx_projects_company ON projects (company_id, status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_project ON tasks (project_id) WHERE project_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Assignments and submissions
-- ---------------------------------------------------------------------------
CREATE TABLE task_assignments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_profile_id uuid        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  application_id    uuid        REFERENCES task_applications(id) ON DELETE SET NULL,
  agreed_amount     bigint      NOT NULL CHECK (agreed_amount > 0),
  currency          char(3)     NOT NULL DEFAULT 'KES',
  status            text        NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE','SUBMITTED','APPROVED','CANCELLED','DISPUTED')),
  due_at            timestamptz,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  cancelled_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, worker_profile_id)
);

CREATE INDEX idx_assignments_worker ON task_assignments (worker_profile_id, status);
CREATE INDEX idx_assignments_task ON task_assignments (task_id, status);
CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON task_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE work_submissions (
  id             uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  uuid              NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
  task_id        uuid              NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  worker_profile_id uuid           NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,

  summary        text              NOT NULL,
  content        text,
  external_links text[]            NOT NULL DEFAULT '{}',
  attempt_number integer           NOT NULL DEFAULT 1 CHECK (attempt_number > 0),

  status         submission_status NOT NULL DEFAULT 'SUBMITTED',
  reviewer_id    uuid              REFERENCES users(id) ON DELETE SET NULL,
  reviewer_notes text,
  quality_rating integer           CHECK (quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5),
  reviewed_at    timestamptz,
  submitted_at   timestamptz       NOT NULL DEFAULT now(),
  created_at     timestamptz       NOT NULL DEFAULT now(),
  updated_at     timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX idx_submissions_assignment ON work_submissions (assignment_id, attempt_number DESC);
CREATE INDEX idx_submissions_task ON work_submissions (task_id, status);
CREATE TRIGGER trg_submissions_updated_at BEFORE UPDATE ON work_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE submission_files (
  submission_id uuid NOT NULL REFERENCES work_submissions(id) ON DELETE CASCADE,
  file_id       uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (submission_id, file_id)
);
