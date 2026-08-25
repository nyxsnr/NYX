-- ===========================================================================
-- 0001_foundation
-- Extensions, shared helpers, enum vocabulary and the geography reference
-- tables. Geography is modelled as country + region (not "county") so that
-- Uganda, Tanzania, Rwanda and Nigeria can be added without a schema change.
-- ===========================================================================

-- gen_random_uuid() is core in PostgreSQL 13+; pgcrypto is kept for digest().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest without trusting the application.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Enum vocabulary
-- ---------------------------------------------------------------------------
CREATE TYPE user_role          AS ENUM ('WORKER', 'EMPLOYER', 'ADMIN');
CREATE TYPE account_status     AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- How much weight a claim carries. The whole product rests on this ladder:
-- a person's profile must never blur what they said with what was proven.
CREATE TYPE evidence_level     AS ENUM (
  'SELF_REPORTED',       -- the worker typed it
  'AI_INFERRED',         -- extracted or inferred by a model from their CV/answers
  'SIMULATION_VERIFIED', -- demonstrated in a scored work simulation
  'EMPLOYER_VERIFIED'    -- an employer confirmed it after real paid work
);

CREATE TYPE skill_level        AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

CREATE TYPE employment_status  AS ENUM (
  'UNEMPLOYED', 'UNDEREMPLOYED', 'EMPLOYED_FULL_TIME', 'EMPLOYED_PART_TIME',
  'SELF_EMPLOYED', 'STUDENT', 'CASUAL_WORKER'
);

CREATE TYPE education_level    AS ENUM (
  'NONE', 'PRIMARY', 'SECONDARY', 'CERTIFICATE', 'DIPLOMA',
  'BACHELORS', 'MASTERS', 'DOCTORATE'
);

CREATE TYPE work_arrangement   AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'ANY');
CREATE TYPE employment_type    AS ENUM (
  'FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'ATTACHMENT', 'CASUAL', 'GIG'
);

CREATE TYPE job_status         AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'CLOSED', 'FILLED', 'REJECTED');
CREATE TYPE application_status AS ENUM (
  'SUBMITTED', 'VIEWED', 'SHORTLISTED', 'INTERVIEWING', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN'
);

-- The task lifecycle from §14 of the product brief.
CREATE TYPE task_status        AS ENUM (
  'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ASSIGNED', 'IN_PROGRESS',
  'SUBMITTED', 'IN_QUALITY_CHECK', 'APPROVED', 'COMPLETED', 'CANCELLED', 'DISPUTED'
);
CREATE TYPE task_application_status AS ENUM (
  'SUBMITTED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'
);
CREATE TYPE submission_status  AS ENUM ('SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED');

CREATE TYPE verification_kind  AS ENUM ('EMAIL', 'PHONE', 'BUSINESS_REGISTRATION', 'TAX_PIN', 'IDENTITY');
CREATE TYPE verification_state AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE employer_verification_tier AS ENUM ('UNVERIFIED', 'BASIC_VERIFIED', 'BUSINESS_VERIFIED');

CREATE TYPE payment_status     AS ENUM (
  'PENDING', 'PROCESSING', 'HELD_IN_ESCROW', 'RELEASED', 'FAILED', 'REFUNDED', 'CANCELLED'
);
CREATE TYPE transaction_kind   AS ENUM (
  'DEPOSIT', 'ESCROW_HOLD', 'ESCROW_RELEASE', 'PLATFORM_FEE',
  'WITHDRAWAL', 'REFUND', 'ADJUSTMENT'
);
CREATE TYPE transaction_direction AS ENUM ('CREDIT', 'DEBIT');

CREATE TYPE dispute_status     AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED_WORKER', 'RESOLVED_EMPLOYER', 'RESOLVED_SPLIT', 'WITHDRAWN');
CREATE TYPE review_subject     AS ENUM ('WORKER', 'EMPLOYER');

CREATE TYPE fraud_severity     AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE fraud_state        AS ENUM ('OPEN', 'REVIEWING', 'CONFIRMED', 'DISMISSED');

CREATE TYPE simulation_state   AS ENUM ('STARTED', 'SUBMITTED', 'EVALUATED', 'ABANDONED', 'EXPIRED');
CREATE TYPE ai_assessment_kind AS ENUM (
  'CV_ANALYSIS', 'CAPABILITY_ASSESSMENT', 'SIMULATION_EVALUATION',
  'INTERVIEW_EVALUATION', 'APPLICATION_ANALYSIS', 'TASK_DECOMPOSITION', 'FRAUD_SIGNAL'
);

CREATE TYPE notification_channel AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP');
CREATE TYPE notification_state   AS ENUM ('QUEUED', 'SENT', 'FAILED', 'READ');

-- ---------------------------------------------------------------------------
-- Geography — market-agnostic by design.
-- ---------------------------------------------------------------------------
CREATE TABLE countries (
  code           char(2)      PRIMARY KEY,             -- ISO 3166-1 alpha-2
  name           text         NOT NULL,
  currency_code  char(3)      NOT NULL,                -- ISO 4217
  dial_prefix    text         NOT NULL,
  region_label   text         NOT NULL DEFAULT 'Region', -- "County" in KE, "District" in UG
  is_active      boolean      NOT NULL DEFAULT false,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE regions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  char(2)     NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  name          text        NOT NULL,
  code          text,                                   -- national numbering, e.g. KE county code
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, name)
);

CREATE INDEX idx_regions_country ON regions (country_code);

INSERT INTO countries (code, name, currency_code, dial_prefix, region_label, is_active) VALUES
  ('KE', 'Kenya',    'KES', '+254', 'County',   true),
  ('UG', 'Uganda',   'UGX', '+256', 'District', false),
  ('TZ', 'Tanzania', 'TZS', '+255', 'Region',   false),
  ('RW', 'Rwanda',   'RWF', '+250', 'District', false),
  ('NG', 'Nigeria',  'NGN', '+234', 'State',    false);

-- The 47 counties of Kenya (Constitution of Kenya 2010, First Schedule).
INSERT INTO regions (country_code, name, code) VALUES
  ('KE','Mombasa','001'),      ('KE','Kwale','002'),        ('KE','Kilifi','003'),
  ('KE','Tana River','004'),   ('KE','Lamu','005'),         ('KE','Taita-Taveta','006'),
  ('KE','Garissa','007'),      ('KE','Wajir','008'),        ('KE','Mandera','009'),
  ('KE','Marsabit','010'),     ('KE','Isiolo','011'),       ('KE','Meru','012'),
  ('KE','Tharaka-Nithi','013'),('KE','Embu','014'),         ('KE','Kitui','015'),
  ('KE','Machakos','016'),     ('KE','Makueni','017'),      ('KE','Nyandarua','018'),
  ('KE','Nyeri','019'),        ('KE','Kirinyaga','020'),    ('KE','Murang''a','021'),
  ('KE','Kiambu','022'),       ('KE','Turkana','023'),      ('KE','West Pokot','024'),
  ('KE','Samburu','025'),      ('KE','Trans Nzoia','026'),  ('KE','Uasin Gishu','027'),
  ('KE','Elgeyo-Marakwet','028'),('KE','Nandi','029'),      ('KE','Baringo','030'),
  ('KE','Laikipia','031'),     ('KE','Nakuru','032'),       ('KE','Narok','033'),
  ('KE','Kajiado','034'),      ('KE','Kericho','035'),      ('KE','Bomet','036'),
  ('KE','Kakamega','037'),     ('KE','Vihiga','038'),       ('KE','Bungoma','039'),
  ('KE','Busia','040'),        ('KE','Siaya','041'),        ('KE','Kisumu','042'),
  ('KE','Homa Bay','043'),     ('KE','Migori','044'),       ('KE','Kisii','045'),
  ('KE','Nyamira','046'),      ('KE','Nairobi','047');
