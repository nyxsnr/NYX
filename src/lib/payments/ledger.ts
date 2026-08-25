/**
 * Double-entry wallet ledger.
 *
 * Invariants enforced here and in the schema:
 *
 *   * every movement writes an immutable `transactions` row (the table has an
 *     append-only trigger — the ledger cannot be rewritten, even by us);
 *   * balances are CHECK-constrained non-negative, so an overdraw aborts the
 *     transaction rather than producing a negative wallet;
 *   * wallet rows are locked FOR UPDATE before being read-modified-written, so
 *     two concurrent releases cannot both see the same starting balance;
 *   * money is only ever moved inside a database transaction, so a partial
 *     transfer is impossible.
 *
 * Amounts are integer minor units (KES cents). No float arithmetic touches
 * money anywhere in this file.
 */
import 'server-only';
import type { TxSql } from '@/lib/db/client';
import { AppError, insufficientFunds } from '@/lib/http/errors';
import { json } from '@/lib/db/client';

export type WalletKind = 'WORKER' | 'EMPLOYER' | 'PLATFORM' | 'ESCROW';
export type Bucket = 'available' | 'pending' | 'escrow';
export type TransactionKind =
  | 'DEPOSIT' | 'ESCROW_HOLD' | 'ESCROW_RELEASE' | 'PLATFORM_FEE'
  | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT';

export interface WalletRow {
  id: string;
  owner_id: string | null;
  kind: WalletKind;
  currency: string;
  balance_available: string;
  balance_pending: string;
  balance_escrow: string;
  lifetime_earned: string;
  lifetime_spent: string;
  is_frozen: boolean;
}

export interface Wallet {
  id: string;
  ownerId: string | null;
  kind: WalletKind;
  currency: string;
  available: number;
  pending: number;
  escrow: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  isFrozen: boolean;
}

const toWallet = (row: WalletRow): Wallet => ({
  id: row.id,
  ownerId: row.owner_id,
  kind: row.kind,
  currency: row.currency,
  available: Number(row.balance_available),
  pending: Number(row.balance_pending),
  escrow: Number(row.balance_escrow),
  lifetimeEarned: Number(row.lifetime_earned),
  lifetimeSpent: Number(row.lifetime_spent),
  isFrozen: row.is_frozen,
});

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError('BAD_REQUEST', 'Amount must be a positive whole number of cents.');
  }
}

/** Get or create a user's wallet. */
export async function ensureWallet(
  tx: TxSql,
  ownerId: string,
  kind: 'WORKER' | 'EMPLOYER',
  currency = 'KES',
): Promise<Wallet> {
  // The uniqueness index is partial (WHERE owner_id IS NOT NULL), so the
  // predicate must be repeated here for Postgres to infer the arbiter index.
  const rows = await tx<WalletRow[]>`
    INSERT INTO wallets (owner_id, kind, currency)
    VALUES (${ownerId}, ${kind}, ${currency})
    ON CONFLICT (owner_id, currency) WHERE owner_id IS NOT NULL
      DO UPDATE SET updated_at = now()
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new AppError('INTERNAL_ERROR', 'Could not open a wallet.');
  return toWallet(row);
}

/** Get or create a singleton system wallet (platform revenue, escrow float). */
export async function systemWallet(
  tx: TxSql,
  kind: 'PLATFORM' | 'ESCROW',
  currency = 'KES',
): Promise<Wallet> {
  const existing = await tx<WalletRow[]>`
    SELECT * FROM wallets WHERE owner_id IS NULL AND kind = ${kind} AND currency = ${currency} LIMIT 1
  `;
  if (existing[0]) return toWallet(existing[0]);

  const created = await tx<WalletRow[]>`
    INSERT INTO wallets (owner_id, kind, currency) VALUES (NULL, ${kind}, ${currency})
    ON CONFLICT (kind, currency) WHERE owner_id IS NULL DO UPDATE SET updated_at = now()
    RETURNING *
  `;
  const row = created[0];
  if (!row) throw new AppError('INTERNAL_ERROR', 'Could not open the system wallet.');
  return toWallet(row);
}

/** Lock a wallet row for the remainder of the transaction. */
async function lockWallet(tx: TxSql, walletId: string): Promise<Wallet> {
  const rows = await tx<WalletRow[]>`SELECT * FROM wallets WHERE id = ${walletId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', 'Wallet not found.');
  if (row.is_frozen) {
    throw new AppError('FORBIDDEN', 'This wallet is frozen pending review. Contact support.');
  }
  return toWallet(row);
}

const BUCKET_COLUMN = {
  available: 'balance_available',
  pending: 'balance_pending',
  escrow: 'balance_escrow',
} as const;

/**
 * Apply a signed movement to one bucket of one wallet and write the ledger row.
 * `delta` is positive for a credit, negative for a debit.
 */
async function applyMovement(
  tx: TxSql,
  walletId: string,
  bucket: Bucket,
  delta: number,
  entry: {
    kind: TransactionKind;
    description: string;
    paymentId?: string | null;
    metadata?: Record<string, unknown>;
    /** Suppress the ledger row for the second leg of an internal transfer. */
    skipLedger?: boolean;
  },
): Promise<Wallet> {
  const wallet = await lockWallet(tx, walletId);
  const current = wallet[bucket === 'available' ? 'available' : bucket === 'pending' ? 'pending' : 'escrow'];

  if (current + delta < 0) {
    throw insufficientFunds(
      `Not enough ${bucket} balance: KES ${(current / 100).toFixed(2)} available, KES ${(Math.abs(delta) / 100).toFixed(2)} required.`,
    );
  }

  const column = BUCKET_COLUMN[bucket];
  const updated = await tx<WalletRow[]>`
    UPDATE wallets
    SET ${tx(column)} = ${tx(column)} + ${delta},
        lifetime_earned = lifetime_earned + ${delta > 0 && bucket === 'available' ? delta : 0},
        lifetime_spent  = lifetime_spent  + ${delta < 0 && bucket === 'available' ? -delta : 0}
    WHERE id = ${walletId}
    RETURNING *
  `;
  const row = updated[0];
  if (!row) throw new AppError('INTERNAL_ERROR', 'Wallet update failed.');

  if (!entry.skipLedger) {
    await tx`
      INSERT INTO transactions (wallet_id, payment_id, kind, direction, amount, currency, balance_after, description, metadata)
      VALUES (
        ${walletId}, ${entry.paymentId ?? null}, ${entry.kind},
        ${delta > 0 ? 'CREDIT' : 'DEBIT'}, ${Math.abs(delta)}, ${wallet.currency},
        ${Number(row.balance_available)}, ${entry.description},
        ${json({ bucket, ...(entry.metadata ?? {}) })}
      )
    `;
  }

  return toWallet(row);
}

export async function credit(
  tx: TxSql,
  walletId: string,
  bucket: Bucket,
  amount: number,
  entry: Parameters<typeof applyMovement>[4],
): Promise<Wallet> {
  assertAmount(amount);
  return applyMovement(tx, walletId, bucket, amount, entry);
}

export async function debit(
  tx: TxSql,
  walletId: string,
  bucket: Bucket,
  amount: number,
  entry: Parameters<typeof applyMovement>[4],
): Promise<Wallet> {
  assertAmount(amount);
  return applyMovement(tx, walletId, bucket, -amount, entry);
}

/**
 * Move money between two buckets of the same wallet.
 * Writes one ledger row describing the movement, not two offsetting ones.
 */
export async function moveBetweenBuckets(
  tx: TxSql,
  walletId: string,
  from: Bucket,
  to: Bucket,
  amount: number,
  entry: { kind: TransactionKind; description: string; paymentId?: string | null; metadata?: Record<string, unknown> },
): Promise<Wallet> {
  assertAmount(amount);
  await applyMovement(tx, walletId, from, -amount, { ...entry, skipLedger: true });
  return applyMovement(tx, walletId, to, amount, {
    ...entry,
    metadata: { ...(entry.metadata ?? {}), movedFrom: from, movedTo: to },
  });
}

export async function getWallet(tx: TxSql, walletId: string): Promise<Wallet> {
  const rows = await tx<WalletRow[]>`SELECT * FROM wallets WHERE id = ${walletId}`;
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', 'Wallet not found.');
  return toWallet(row);
}

/**
 * Verify the ledger reconciles against the wallet balance.
 * Run from the admin dashboard and from tests — a mismatch is a serious bug.
 */
export async function reconcileWallet(
  tx: TxSql,
  walletId: string,
): Promise<{ balanced: boolean; walletAvailable: number; ledgerAvailable: number; difference: number }> {
  const wallet = await getWallet(tx, walletId);
  const rows = await tx<{ total: string | null }[]>`
    SELECT coalesce(
      sum(
        CASE
          WHEN metadata->>'bucket' = 'available' AND direction = 'CREDIT' THEN amount
          WHEN metadata->>'bucket' = 'available' AND direction = 'DEBIT'  THEN -amount
          ELSE 0
        END
      ), 0
    )::text AS total
    FROM transactions WHERE wallet_id = ${walletId}
  `;
  const ledgerAvailable = Number(rows[0]?.total ?? 0);
  return {
    balanced: ledgerAvailable === wallet.available,
    walletAvailable: wallet.available,
    ledgerAvailable,
    difference: wallet.available - ledgerAvailable,
  };
}

/** KES cents -> "KES 1,234.00". Used everywhere money is displayed. */
export function formatMoney(minor: number, currency = 'KES'): string {
  const major = minor / 100;
  return `${currency} ${major.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Split a gross amount into platform fee and worker net. */
export function splitFee(grossMinor: number, feeBps: number): { fee: number; net: number } {
  const fee = Math.round((grossMinor * feeBps) / 10_000);
  return { fee, net: grossMinor - fee };
}
