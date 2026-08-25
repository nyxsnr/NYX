-- ===========================================================================
-- 0006_money
-- Wallets, an append-only double-entry ledger, escrowed payments and payouts.
--
-- Rules enforced here rather than trusted to application code:
--   * every transaction amount is strictly positive; direction carries sign
--   * the ledger is append-only (no UPDATE/DELETE trigger guard)
--   * balances can never go negative
--   * provider references are unique, so a webhook replay cannot double-credit
-- No card numbers, PINs or M-Pesa credentials are ever stored.
-- ===========================================================================

CREATE TABLE wallets (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid        REFERENCES users(id) ON DELETE CASCADE,
  kind             text        NOT NULL CHECK (kind IN ('WORKER','EMPLOYER','PLATFORM','ESCROW')),
  currency         char(3)     NOT NULL DEFAULT 'KES',

  -- Spendable right now.
  balance_available bigint     NOT NULL DEFAULT 0 CHECK (balance_available >= 0),
  -- Earned but not yet released (worker side of escrow).
  balance_pending   bigint     NOT NULL DEFAULT 0 CHECK (balance_pending >= 0),
  -- Committed to open work (employer side of escrow).
  balance_escrow    bigint     NOT NULL DEFAULT 0 CHECK (balance_escrow >= 0),

  lifetime_earned   bigint     NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent    bigint     NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),

  is_frozen         boolean    NOT NULL DEFAULT false,
  frozen_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One wallet per owner per currency. Platform/escrow wallets are singletons
-- (owner_id IS NULL) enforced by the partial index below.
CREATE UNIQUE INDEX idx_wallets_owner_currency
  ON wallets (owner_id, currency) WHERE owner_id IS NOT NULL;
CREATE UNIQUE INDEX idx_wallets_system
  ON wallets (kind, currency) WHERE owner_id IS NULL;
CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Payments — one row per employer-funded work item.
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  reference         text           NOT NULL UNIQUE,   -- human-facing, e.g. KZ-P-8F3A21
  payer_user_id     uuid           REFERENCES users(id) ON DELETE SET NULL,
  payer_company_id  uuid           REFERENCES companies(id) ON DELETE SET NULL,
  payee_user_id     uuid           REFERENCES users(id) ON DELETE SET NULL,

  task_id           uuid           REFERENCES tasks(id) ON DELETE SET NULL,
  assignment_id     uuid           REFERENCES task_assignments(id) ON DELETE SET NULL,

  gross_amount      bigint         NOT NULL CHECK (gross_amount > 0),
  platform_fee      bigint         NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  net_amount        bigint         NOT NULL CHECK (net_amount >= 0),
  currency          char(3)        NOT NULL DEFAULT 'KES',

  status            payment_status NOT NULL DEFAULT 'PENDING',
  provider          text           NOT NULL DEFAULT 'mock',   -- 'mock' | 'mpesa' | ...
  provider_reference text,
  -- Supplied by the caller; makes initiate/release safely retryable.
  idempotency_key   text           NOT NULL UNIQUE,
  failure_reason    text,
  metadata          jsonb          NOT NULL DEFAULT '{}'::jsonb,

  initiated_at      timestamptz,
  held_at           timestamptz,
  released_at       timestamptz,
  refunded_at       timestamptz,
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT chk_payment_split CHECK (net_amount + platform_fee = gross_amount)
);

CREATE UNIQUE INDEX idx_payments_provider_ref
  ON payments (provider, provider_reference) WHERE provider_reference IS NOT NULL;
CREATE INDEX idx_payments_payer ON payments (payer_user_id, status, created_at DESC);
CREATE INDEX idx_payments_payee ON payments (payee_user_id, status, created_at DESC);
CREATE INDEX idx_payments_assignment ON payments (assignment_id);
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Ledger — append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  id            uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     uuid                  NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  payment_id    uuid                  REFERENCES payments(id) ON DELETE SET NULL,
  kind          transaction_kind      NOT NULL,
  direction     transaction_direction NOT NULL,
  amount        bigint                NOT NULL CHECK (amount > 0),
  currency      char(3)               NOT NULL DEFAULT 'KES',
  -- Snapshot of available balance after this entry, for statement rendering.
  balance_after bigint                NOT NULL CHECK (balance_after >= 0),
  description   text                  NOT NULL,
  metadata      jsonb                 NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_wallet ON transactions (wallet_id, created_at DESC);
CREATE INDEX idx_transactions_payment ON transactions (payment_id);

-- Guard the ledger's append-only property at the database level.
CREATE OR REPLACE FUNCTION reject_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'transactions is append-only; ledger entries cannot be % ', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_append_only
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Payouts — moving a worker's available balance off-platform (M-Pesa).
-- ---------------------------------------------------------------------------
CREATE TABLE payouts (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        text           NOT NULL UNIQUE,
  wallet_id        uuid           NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  user_id          uuid           NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount           bigint         NOT NULL CHECK (amount > 0),
  currency         char(3)        NOT NULL DEFAULT 'KES',
  status           payment_status NOT NULL DEFAULT 'PENDING',
  provider         text           NOT NULL DEFAULT 'mock',
  -- Destination is stored masked (e.g. "+254 7** *** 678"); the full number
  -- lives on the user record, which is access-controlled.
  destination_mask text,
  provider_reference text,
  idempotency_key  text           NOT NULL UNIQUE,
  failure_reason   text,
  requested_at     timestamptz    NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_payouts_user ON payouts (user_id, status, created_at DESC);
CREATE TRIGGER trg_payouts_updated_at BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
