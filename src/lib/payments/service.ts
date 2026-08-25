/**
 * Payment orchestration.
 *
 * The escrow lifecycle, end to end:
 *
 *   deposit          employer funds their KaziOS balance via a provider
 *   holdInEscrow     on assignment, funds move available -> escrow (locked)
 *   release          on approval, escrow -> worker available, minus platform fee
 *   refund           on cancellation or a dispute won by the employer
 *   payout           worker moves their available balance off-platform
 *
 * Money never moves outside a database transaction, and every state change is
 * written to the audit log. Provider calls happen outside the transaction and
 * are reconciled by reference, so a provider timeout cannot leave the ledger
 * half-written.
 */
import 'server-only';
import { randomBytes } from 'node:crypto';
import { json, sql, withTransaction, type TxSql } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';
import { AppError, conflict, notFound } from '@/lib/http/errors';
import { audit } from '@/lib/audit';
import type { PaymentProvider } from './types';
import { MockPaymentProvider } from './providers/mock';
import { MpesaProvider } from './providers/mpesa';
import { credit, debit, ensureWallet, moveBetweenBuckets, splitFee, systemWallet, type Wallet } from './ledger';

let providerInstance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (providerInstance) return providerInstance;
  providerInstance = getEnv().PAYMENT_PROVIDER === 'mpesa' ? new MpesaProvider() : new MockPaymentProvider();
  return providerInstance;
}

/** Test seam. */
export function setPaymentProvider(provider: PaymentProvider | null): void {
  providerInstance = provider;
}

/** Human-facing reference, e.g. KZ-P-7F3A21B9. */
function reference(prefix: 'P' | 'O' | 'D'): string {
  return `KZ-${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export interface PaymentRow {
  id: string;
  reference: string;
  payer_user_id: string | null;
  payer_company_id: string | null;
  payee_user_id: string | null;
  task_id: string | null;
  assignment_id: string | null;
  gross_amount: string;
  platform_fee: string;
  net_amount: string;
  currency: string;
  status: string;
  provider: string;
  provider_reference: string | null;
  created_at: Date;
  released_at: Date | null;
}

// ---------------------------------------------------------------------------
// Deposits — employer tops up their KaziOS balance
// ---------------------------------------------------------------------------

export async function initiateDeposit(input: {
  userId: string;
  amountMinor: number;
  currency?: string;
  payerPhone?: string | null;
  payerEmail?: string | null;
  idempotencyKey: string;
}): Promise<{ paymentId: string; reference: string; instruction?: string; status: string }> {
  const provider = getPaymentProvider();
  const currency = input.currency ?? 'KES';

  // Idempotency first: a retried request must return the original result, not
  // charge the employer twice.
  const existing = await sql<PaymentRow[]>`
    SELECT * FROM payments WHERE idempotency_key = ${input.idempotencyKey} LIMIT 1
  `;
  if (existing[0]) {
    return {
      paymentId: existing[0].id,
      reference: existing[0].reference,
      status: existing[0].status,
      instruction: 'This deposit was already started.',
    };
  }

  const ref = reference('D');
  const rows = await sql<PaymentRow[]>`
    INSERT INTO payments (
      reference, payer_user_id, gross_amount, platform_fee, net_amount, currency,
      status, provider, idempotency_key, initiated_at, metadata
    ) VALUES (
      ${ref}, ${input.userId}, ${input.amountMinor}, 0, ${input.amountMinor}, ${currency},
      'PENDING', ${provider.name}, ${input.idempotencyKey}, now(), ${json({ type: 'deposit' })}
    )
    RETURNING *
  `;
  const payment = rows[0];
  if (!payment) throw new AppError('INTERNAL_ERROR', 'Could not create the deposit.');

  const intent = await provider.initiatePayment({
    amountMinor: input.amountMinor,
    currency,
    reference: ref,
    description: 'KaziOS balance top-up',
    payerPhone: input.payerPhone ?? null,
    payerEmail: input.payerEmail ?? null,
    idempotencyKey: input.idempotencyKey,
  });

  await sql`
    UPDATE payments
    SET provider_reference = ${intent.providerReference},
        status = ${intent.status === 'FAILED' ? 'FAILED' : 'PROCESSING'}
    WHERE id = ${payment.id}
  `;

  await audit({
    actorId: input.userId,
    action: 'payment.deposit.initiated',
    entityType: 'payment',
    entityId: payment.id,
    metadata: { amountMinor: input.amountMinor, provider: provider.name },
  });

  // A successful synchronous provider (the development one) settles now.
  if (intent.status === 'SUCCEEDED') {
    await confirmDeposit(payment.id);
  }

  return {
    paymentId: payment.id,
    reference: ref,
    instruction: intent.userInstruction,
    status: intent.status,
  };
}

/**
 * Settle a deposit after verifying it with the provider.
 *
 * Verification is always re-fetched from the provider; a webhook body is never
 * trusted as proof of payment, which is what stops a forged callback from
 * crediting an account.
 */
export async function confirmDeposit(paymentId: string): Promise<{ status: string; wallet?: Wallet }> {
  const provider = getPaymentProvider();

  const rows = await sql<PaymentRow[]>`SELECT * FROM payments WHERE id = ${paymentId}`;
  const payment = rows[0];
  if (!payment) throw notFound('Payment');
  if (payment.status === 'RELEASED') return { status: 'RELEASED' };
  if (!payment.provider_reference) throw conflict('This deposit has no provider reference to verify.');

  const verification = await provider.verifyPayment(payment.provider_reference);

  if (verification.status !== 'SUCCEEDED') {
    await sql`
      UPDATE payments SET status = 'FAILED', failure_reason = ${verification.failureReason ?? 'Payment was not completed.'}
      WHERE id = ${paymentId} AND status <> 'RELEASED'
    `;
    return { status: 'FAILED' };
  }

  const wallet = await withTransaction(async (tx) => {
    // Re-read under lock so two concurrent confirmations cannot both credit.
    const locked = await tx<PaymentRow[]>`
      SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE
    `;
    const current = locked[0];
    if (!current || current.status === 'RELEASED') return null;

    if (!current.payer_user_id) throw conflict('Deposit has no payer.');
    const employerWallet = await ensureWallet(tx, current.payer_user_id, 'EMPLOYER', current.currency);

    const updated = await credit(tx, employerWallet.id, 'available', Number(current.gross_amount), {
      kind: 'DEPOSIT',
      description: `Balance top-up ${current.reference}`,
      paymentId: current.id,
      metadata: { externalId: verification.externalId },
    });

    await tx`
      UPDATE payments
      SET status = 'RELEASED', released_at = now(), provider_reference = ${verification.providerReference}
      WHERE id = ${paymentId}
    `;

    return updated;
  });

  await audit({
    actorId: payment.payer_user_id,
    action: 'payment.deposit.confirmed',
    entityType: 'payment',
    entityId: paymentId,
    metadata: { amountMinor: Number(payment.gross_amount) },
  });

  return { status: 'RELEASED', ...(wallet ? { wallet } : {}) };
}

// ---------------------------------------------------------------------------
// Escrow
// ---------------------------------------------------------------------------

/**
 * Lock funds for an assignment.
 *
 * Called when an employer accepts a worker for a task. The worker sees
 * "funded" before starting work, which is the whole point of escrow: it is the
 * platform's answer to "will I actually get paid?".
 */
export async function holdInEscrow(input: {
  assignmentId: string;
  employerUserId: string;
  companyId: string;
  workerUserId: string;
  taskId: string;
  grossMinor: number;
  currency?: string;
  idempotencyKey: string;
}): Promise<{ paymentId: string; reference: string; fee: number; net: number }> {
  const currency = input.currency ?? 'KES';
  const { fee, net } = splitFee(input.grossMinor, getEnv().PLATFORM_FEE_BPS);

  const existing = await sql<PaymentRow[]>`
    SELECT * FROM payments WHERE idempotency_key = ${input.idempotencyKey} LIMIT 1
  `;
  if (existing[0]) {
    return {
      paymentId: existing[0].id,
      reference: existing[0].reference,
      fee: Number(existing[0].platform_fee),
      net: Number(existing[0].net_amount),
    };
  }

  const result = await withTransaction(async (tx: TxSql) => {
    const employerWallet = await ensureWallet(tx, input.employerUserId, 'EMPLOYER', currency);

    const ref = reference('P');
    const created = await tx<PaymentRow[]>`
      INSERT INTO payments (
        reference, payer_user_id, payer_company_id, payee_user_id, task_id, assignment_id,
        gross_amount, platform_fee, net_amount, currency, status, provider,
        idempotency_key, initiated_at, held_at
      ) VALUES (
        ${ref}, ${input.employerUserId}, ${input.companyId}, ${input.workerUserId},
        ${input.taskId}, ${input.assignmentId},
        ${input.grossMinor}, ${fee}, ${net}, ${currency}, 'HELD_IN_ESCROW',
        ${getPaymentProvider().name}, ${input.idempotencyKey}, now(), now()
      )
      RETURNING *
    `;
    const payment = created[0];
    if (!payment) throw new AppError('INTERNAL_ERROR', 'Could not create the payment.');

    // Fails cleanly on insufficient balance — the CHECK constraint aborts the
    // whole transaction, so no assignment is left funded-but-unpaid.
    await moveBetweenBuckets(tx, employerWallet.id, 'available', 'escrow', input.grossMinor, {
      kind: 'ESCROW_HOLD',
      description: `Funds locked for task work (${ref})`,
      paymentId: payment.id,
      metadata: { assignmentId: input.assignmentId, taskId: input.taskId },
    });

    // Mirror the worker's side as a pending balance so they can see what is
    // coming without being able to spend it yet.
    const workerWallet = await ensureWallet(tx, input.workerUserId, 'WORKER', currency);
    await credit(tx, workerWallet.id, 'pending', net, {
      kind: 'ESCROW_HOLD',
      description: `Payment held in escrow for your task work (${ref})`,
      paymentId: payment.id,
      metadata: { assignmentId: input.assignmentId },
    });

    return { paymentId: payment.id, reference: ref, fee, net };
  });

  await audit({
    actorId: input.employerUserId,
    action: 'payment.escrow.held',
    entityType: 'payment',
    entityId: result.paymentId,
    metadata: { grossMinor: input.grossMinor, fee, net, assignmentId: input.assignmentId },
  });

  return result;
}

/**
 * Release escrowed funds to the worker after the employer approves the work.
 * This is the moment the North Star metric moves.
 */
export async function releasePayment(input: {
  paymentId: string;
  actorId: string;
  reason?: string;
}): Promise<{ status: string; netPaid: number; fee: number }> {
  const provider = getPaymentProvider();

  const result = await withTransaction(async (tx: TxSql) => {
    const rows = await tx<PaymentRow[]>`SELECT * FROM payments WHERE id = ${input.paymentId} FOR UPDATE`;
    const payment = rows[0];
    if (!payment) throw notFound('Payment');
    if (payment.status === 'RELEASED') {
      // Idempotent: releasing twice is a no-op, not a double payment.
      return { status: 'RELEASED', netPaid: Number(payment.net_amount), fee: Number(payment.platform_fee), alreadyDone: true };
    }
    if (payment.status !== 'HELD_IN_ESCROW') {
      throw conflict(`Only escrowed payments can be released. This payment is ${payment.status}.`);
    }
    if (!payment.payer_user_id || !payment.payee_user_id) {
      throw conflict('Payment is missing a payer or payee.');
    }

    const gross = Number(payment.gross_amount);
    const fee = Number(payment.platform_fee);
    const net = Number(payment.net_amount);

    const employerWallet = await ensureWallet(tx, payment.payer_user_id, 'EMPLOYER', payment.currency);
    const workerWallet = await ensureWallet(tx, payment.payee_user_id, 'WORKER', payment.currency);
    const platform = await systemWallet(tx, 'PLATFORM', payment.currency);

    // Employer's escrow bucket empties.
    await debit(tx, employerWallet.id, 'escrow', gross, {
      kind: 'ESCROW_RELEASE',
      description: `Payment released for approved work (${payment.reference})`,
      paymentId: payment.id,
    });

    // Worker's pending becomes spendable.
    await debit(tx, workerWallet.id, 'pending', net, {
      kind: 'ESCROW_RELEASE',
      description: `Escrow cleared (${payment.reference})`,
      paymentId: payment.id,
    });
    await credit(tx, workerWallet.id, 'available', net, {
      kind: 'ESCROW_RELEASE',
      description: `Payment received for approved work (${payment.reference})`,
      paymentId: payment.id,
    });

    if (fee > 0) {
      await credit(tx, platform.id, 'available', fee, {
        kind: 'PLATFORM_FEE',
        description: `Platform fee on ${payment.reference}`,
        paymentId: payment.id,
      });
    }

    await tx`UPDATE payments SET status = 'RELEASED', released_at = now() WHERE id = ${payment.id}`;

    // Keep the denormalised counters honest in the same transaction.
    await tx`
      UPDATE worker_profiles
      SET total_earned = total_earned + ${net}
      WHERE user_id = ${payment.payee_user_id}
    `;
    if (payment.payer_company_id) {
      await tx`
        UPDATE companies SET total_spent = total_spent + ${gross} WHERE id = ${payment.payer_company_id}
      `;
    }

    return { status: 'RELEASED', netPaid: net, fee, alreadyDone: false, providerReference: payment.provider_reference, gross };
  });

  if (!result.alreadyDone) {
    // Best-effort provider acknowledgement; the ledger is already authoritative.
    if (result.providerReference) {
      try {
        await provider.releasePayment(result.providerReference, result.gross ?? 0);
      } catch (err) {
        console.error('[payments] provider release acknowledgement failed', err);
      }
    }
    await audit({
      actorId: input.actorId,
      action: 'payment.released',
      entityType: 'payment',
      entityId: input.paymentId,
      metadata: { netPaid: result.netPaid, fee: result.fee, reason: input.reason },
    });
  }

  return { status: result.status, netPaid: result.netPaid, fee: result.fee };
}

/** Return escrowed funds to the employer. */
export async function refundPayment(input: {
  paymentId: string;
  actorId: string;
  reason: string;
  /** Partial refunds settle a split dispute; omit for a full refund. */
  amountMinor?: number;
}): Promise<{ status: string; refunded: number; paidToWorker: number }> {
  const result = await withTransaction(async (tx: TxSql) => {
    const rows = await tx<PaymentRow[]>`SELECT * FROM payments WHERE id = ${input.paymentId} FOR UPDATE`;
    const payment = rows[0];
    if (!payment) throw notFound('Payment');
    if (payment.status === 'REFUNDED') {
      return { status: 'REFUNDED', refunded: Number(payment.gross_amount), paidToWorker: 0 };
    }
    if (payment.status !== 'HELD_IN_ESCROW') {
      throw conflict(`Only escrowed payments can be refunded. This payment is ${payment.status}.`);
    }
    if (!payment.payer_user_id || !payment.payee_user_id) throw conflict('Payment is missing a party.');

    const gross = Number(payment.gross_amount);
    const net = Number(payment.net_amount);
    const refundAmount = input.amountMinor ?? gross;
    if (refundAmount <= 0 || refundAmount > gross) {
      throw new AppError('BAD_REQUEST', 'Refund amount must be between zero and the escrowed amount.');
    }

    const employerWallet = await ensureWallet(tx, payment.payer_user_id, 'EMPLOYER', payment.currency);
    const workerWallet = await ensureWallet(tx, payment.payee_user_id, 'WORKER', payment.currency);

    // Release the employer's escrow hold in full, then re-split.
    await debit(tx, employerWallet.id, 'escrow', gross, {
      kind: 'REFUND',
      description: `Escrow released on refund (${payment.reference})`,
      paymentId: payment.id,
      metadata: { reason: input.reason },
    });
    await credit(tx, employerWallet.id, 'available', refundAmount, {
      kind: 'REFUND',
      description: `Refund for ${payment.reference}: ${input.reason}`,
      paymentId: payment.id,
    });

    // Clear the worker's pending mirror.
    await debit(tx, workerWallet.id, 'pending', net, {
      kind: 'REFUND',
      description: `Escrow cleared on refund (${payment.reference})`,
      paymentId: payment.id,
      metadata: { reason: input.reason },
    });

    // A partial refund means the worker keeps the remainder for work done.
    const workerShare = gross - refundAmount;
    let paidToWorker = 0;
    if (workerShare > 0) {
      const { fee, net: workerNet } = splitFee(workerShare, getEnv().PLATFORM_FEE_BPS);
      await credit(tx, workerWallet.id, 'available', workerNet, {
        kind: 'ESCROW_RELEASE',
        description: `Partial payment for work completed (${payment.reference})`,
        paymentId: payment.id,
      });
      if (fee > 0) {
        const platform = await systemWallet(tx, 'PLATFORM', payment.currency);
        await credit(tx, platform.id, 'available', fee, {
          kind: 'PLATFORM_FEE',
          description: `Platform fee on partial settlement ${payment.reference}`,
          paymentId: payment.id,
        });
      }
      await tx`
        UPDATE worker_profiles SET total_earned = total_earned + ${workerNet}
        WHERE user_id = ${payment.payee_user_id}
      `;
      paidToWorker = workerNet;
    }

    await tx`
      UPDATE payments
      SET status = ${workerShare > 0 ? 'RELEASED' : 'REFUNDED'},
          refunded_at = now(),
          failure_reason = ${input.reason}
      WHERE id = ${payment.id}
    `;

    return { status: workerShare > 0 ? 'PARTIALLY_REFUNDED' : 'REFUNDED', refunded: refundAmount, paidToWorker };
  });

  await audit({
    actorId: input.actorId,
    action: 'payment.refunded',
    entityType: 'payment',
    entityId: input.paymentId,
    metadata: { ...result, reason: input.reason },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export const MIN_PAYOUT_MINOR = 20_000; // KES 200

export async function requestPayout(input: {
  userId: string;
  amountMinor: number;
  destinationPhone: string;
  idempotencyKey: string;
}): Promise<{ payoutId: string; reference: string; status: string }> {
  if (input.amountMinor < MIN_PAYOUT_MINOR) {
    throw new AppError(
      'BAD_REQUEST',
      `The minimum withdrawal is KES ${(MIN_PAYOUT_MINOR / 100).toFixed(0)}.`,
    );
  }

  const existing = await sql<{ id: string; reference: string; status: string }[]>`
    SELECT id, reference, status FROM payouts WHERE idempotency_key = ${input.idempotencyKey} LIMIT 1
  `;
  if (existing[0]) return { payoutId: existing[0].id, reference: existing[0].reference, status: existing[0].status };

  const ref = reference('O');
  // Mask the destination for storage; the full number stays on the user record.
  const mask = input.destinationPhone.replace(/^(\+\d{3}\s?\d)(\d+)(\d{3})$/, (_m, a, b, c) => `${a}${'*'.repeat(b.length)}${c}`);

  const result = await withTransaction(async (tx: TxSql) => {
    const wallet = await ensureWallet(tx, input.userId, 'WORKER');

    // Debit first: the CHECK constraint prevents withdrawing more than exists.
    await debit(tx, wallet.id, 'available', input.amountMinor, {
      kind: 'WITHDRAWAL',
      description: `Withdrawal to mobile money (${ref})`,
      metadata: { destination: mask },
    });

    const rows = await tx<{ id: string }[]>`
      INSERT INTO payouts (reference, wallet_id, user_id, amount, currency, status, provider, destination_mask, idempotency_key)
      VALUES (${ref}, ${wallet.id}, ${input.userId}, ${input.amountMinor}, ${wallet.currency}, 'PROCESSING',
              ${getPaymentProvider().name}, ${mask}, ${input.idempotencyKey})
      RETURNING id
    `;
    const row = rows[0];
    if (!row) throw new AppError('INTERNAL_ERROR', 'Could not create the payout.');
    return { payoutId: row.id };
  });

  // Provider call outside the transaction. On failure the amount is returned
  // to the wallet so a worker is never left short.
  try {
    const outcome = await getPaymentProvider().payout({
      amountMinor: input.amountMinor,
      currency: 'KES',
      reference: ref,
      destinationPhone: input.destinationPhone,
      description: 'KaziOS earnings withdrawal',
      idempotencyKey: input.idempotencyKey,
    });

    await sql`
      UPDATE payouts
      SET status = ${outcome.status === 'SUCCEEDED' ? 'RELEASED' : 'PROCESSING'},
          provider_reference = ${outcome.providerReference},
          completed_at = ${outcome.status === 'SUCCEEDED' ? sql`now()` : null}
      WHERE id = ${result.payoutId}
    `;

    await audit({
      actorId: input.userId,
      action: 'payout.requested',
      entityType: 'payout',
      entityId: result.payoutId,
      metadata: { amountMinor: input.amountMinor, status: outcome.status },
    });

    return { payoutId: result.payoutId, reference: ref, status: outcome.status };
  } catch (err) {
    await withTransaction(async (tx: TxSql) => {
      const wallet = await ensureWallet(tx, input.userId, 'WORKER');
      await credit(tx, wallet.id, 'available', input.amountMinor, {
        kind: 'ADJUSTMENT',
        description: `Withdrawal ${ref} could not be completed — amount returned to your balance`,
        metadata: { payoutId: result.payoutId },
      });
      await tx`
        UPDATE payouts
        SET status = 'FAILED', failure_reason = ${err instanceof Error ? err.message : 'Payout failed.'}
        WHERE id = ${result.payoutId}
      `;
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface WalletSummary {
  available: number;
  pending: number;
  escrow: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  currency: string;
  isFrozen: boolean;
  /** False when running on the development provider — surfaced in the UI. */
  paymentsAreLive: boolean;
}

export async function getWalletSummary(
  userId: string,
  kind: 'WORKER' | 'EMPLOYER',
): Promise<WalletSummary> {
  const wallet = await withTransaction((tx) => ensureWallet(tx, userId, kind));
  return {
    available: wallet.available,
    pending: wallet.pending,
    escrow: wallet.escrow,
    lifetimeEarned: wallet.lifetimeEarned,
    lifetimeSpent: wallet.lifetimeSpent,
    currency: wallet.currency,
    isFrozen: wallet.isFrozen,
    paymentsAreLive: getPaymentProvider().isLive,
  };
}

export interface TransactionView {
  id: string;
  kind: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: Date;
}

export async function listTransactions(
  userId: string,
  kind: 'WORKER' | 'EMPLOYER',
  options: { limit?: number; offset?: number } = {},
): Promise<{ items: TransactionView[]; total: number }> {
  const limit = Math.min(100, options.limit ?? 20);
  const offset = options.offset ?? 0;

  const rows = await sql<
    Array<{ id: string; kind: string; direction: 'CREDIT' | 'DEBIT'; amount: string; balance_after: string; description: string; created_at: Date; total: string }>
  >`
    SELECT t.id, t.kind, t.direction, t.amount, t.balance_after, t.description, t.created_at,
           count(*) OVER ()::text AS total
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    WHERE w.owner_id = ${userId} AND w.kind = ${kind}
    ORDER BY t.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      direction: r.direction,
      amount: Number(r.amount),
      balanceAfter: Number(r.balance_after),
      description: r.description,
      createdAt: r.created_at,
    })),
    total: Number(rows[0]?.total ?? 0),
  };
}
