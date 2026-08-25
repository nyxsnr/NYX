import { describe, expect, it } from 'vitest';
import {
  createEmployer, createTask, createWorker, fundEmployer,
  hasDatabase, testDb, useCleanDatabase, walletFor,
} from './helpers';
import { holdInEscrow, refundPayment, releasePayment, requestPayout } from '@/lib/payments/service';
import { splitFee } from '@/lib/payments/ledger';

/**
 * Escrow and ledger behaviour, against a real database.
 *
 * These assertions are about money, so they check the ledger and the wallet
 * balances independently — a test that only checked the return value would
 * pass even if nothing was actually written.
 */
describe.skipIf(!hasDatabase)('escrow lifecycle', () => {
  useCleanDatabase();

  async function setup(budget = 50_000_00) {
    const employer = await createEmployer('employer@test.local');
    const worker = await createWorker('worker@test.local');
    await fundEmployer(employer.userId, 200_000_00);
    const taskId = await createTask({
      companyId: employer.companyId,
      postedBy: employer.userId,
      budgetMinor: budget,
    });

    const sql = testDb();
    const assignments = await sql<{ id: string }[]>`
      INSERT INTO task_assignments (task_id, worker_profile_id, agreed_amount, currency)
      VALUES (${taskId}, ${worker.profileId}, ${budget}, 'KES')
      RETURNING id
    `;

    return { employer, worker, taskId, assignmentId: assignments[0]?.id as string, budget };
  }

  it('locks the employer balance and mirrors the worker net as pending', async () => {
    const { employer, worker, taskId, assignmentId, budget } = await setup();
    const { fee, net } = splitFee(budget, 1000);

    await holdInEscrow({
      assignmentId,
      employerUserId: employer.userId,
      companyId: employer.companyId,
      workerUserId: worker.userId,
      taskId,
      grossMinor: budget,
      idempotencyKey: `escrow:${assignmentId}`,
    });

    const employerWallet = await walletFor(employer.userId, 'EMPLOYER');
    expect(employerWallet.available).toBe(200_000_00 - budget);
    expect(employerWallet.escrow).toBe(budget);

    // The worker can see the money is committed, but cannot spend it yet.
    const workerWallet = await walletFor(worker.userId, 'WORKER');
    expect(workerWallet.pending).toBe(net);
    expect(workerWallet.available).toBe(0);
    expect(fee + net).toBe(budget);
  });

  it('refuses to fund escrow beyond the available balance', async () => {
    const employer = await createEmployer('poor@test.local');
    const worker = await createWorker('worker2@test.local');
    await fundEmployer(employer.userId, 1_000_00);
    const taskId = await createTask({ companyId: employer.companyId, postedBy: employer.userId, budgetMinor: 50_000_00 });

    const sql = testDb();
    const assignments = await sql<{ id: string }[]>`
      INSERT INTO task_assignments (task_id, worker_profile_id, agreed_amount, currency)
      VALUES (${taskId}, ${worker.profileId}, 50_000_00, 'KES') RETURNING id
    `;

    await expect(
      holdInEscrow({
        assignmentId: assignments[0]?.id as string,
        employerUserId: employer.userId,
        companyId: employer.companyId,
        workerUserId: worker.userId,
        taskId,
        grossMinor: 50_000_00,
        idempotencyKey: 'escrow:overdraw',
      }),
    ).rejects.toThrow(/balance/i);

    // The whole transaction must roll back — no partial state.
    const employerWallet = await walletFor(employer.userId, 'EMPLOYER');
    expect(employerWallet.available).toBe(1_000_00);
    expect(employerWallet.escrow).toBe(0);

    const payments = await sql`SELECT id FROM payments WHERE idempotency_key = 'escrow:overdraw'`;
    expect(payments).toHaveLength(0);
  });

  it('releases the net to the worker and the fee to the platform', async () => {
    const { employer, worker, taskId, assignmentId, budget } = await setup();
    const { fee, net } = splitFee(budget, 1000);

    const held = await holdInEscrow({
      assignmentId,
      employerUserId: employer.userId,
      companyId: employer.companyId,
      workerUserId: worker.userId,
      taskId,
      grossMinor: budget,
      idempotencyKey: `escrow:${assignmentId}`,
    });

    const result = await releasePayment({ paymentId: held.paymentId, actorId: employer.userId });
    expect(result.netPaid).toBe(net);
    expect(result.fee).toBe(fee);

    const workerWallet = await walletFor(worker.userId, 'WORKER');
    expect(workerWallet.available).toBe(net);
    expect(workerWallet.pending).toBe(0);
    expect(workerWallet.lifetimeEarned).toBe(net);

    const employerWallet = await walletFor(employer.userId, 'EMPLOYER');
    expect(employerWallet.escrow).toBe(0);

    const sql = testDb();
    const platform = await sql<{ balance_available: string }[]>`
      SELECT balance_available FROM wallets WHERE kind = 'PLATFORM' AND owner_id IS NULL
    `;
    expect(Number(platform[0]?.balance_available ?? 0)).toBe(fee);
  });

  it('is idempotent: releasing twice does not pay twice', async () => {
    const { employer, worker, taskId, assignmentId, budget } = await setup();
    const { net } = splitFee(budget, 1000);

    const held = await holdInEscrow({
      assignmentId,
      employerUserId: employer.userId,
      companyId: employer.companyId,
      workerUserId: worker.userId,
      taskId,
      grossMinor: budget,
      idempotencyKey: `escrow:${assignmentId}`,
    });

    await releasePayment({ paymentId: held.paymentId, actorId: employer.userId });
    await releasePayment({ paymentId: held.paymentId, actorId: employer.userId });

    expect((await walletFor(worker.userId, 'WORKER')).available).toBe(net);
  });

  it('is idempotent on funding: the same key returns the original payment', async () => {
    const { employer, worker, taskId, assignmentId, budget } = await setup();
    const key = `escrow:${assignmentId}`;

    const first = await holdInEscrow({
      assignmentId, employerUserId: employer.userId, companyId: employer.companyId,
      workerUserId: worker.userId, taskId, grossMinor: budget, idempotencyKey: key,
    });
    const second = await holdInEscrow({
      assignmentId, employerUserId: employer.userId, companyId: employer.companyId,
      workerUserId: worker.userId, taskId, grossMinor: budget, idempotencyKey: key,
    });

    expect(second.paymentId).toBe(first.paymentId);
    expect((await walletFor(employer.userId, 'EMPLOYER')).escrow).toBe(budget);
  });

  it('refunds the employer in full and clears the worker pending balance', async () => {
    const { employer, worker, taskId, assignmentId, budget } = await setup();

    const held = await holdInEscrow({
      assignmentId, employerUserId: employer.userId, companyId: employer.companyId,
      workerUserId: worker.userId, taskId, grossMinor: budget, idempotencyKey: `escrow:${assignmentId}`,
    });

    await refundPayment({ paymentId: held.paymentId, actorId: employer.userId, reason: 'Work cancelled' });

    expect((await walletFor(employer.userId, 'EMPLOYER')).available).toBe(200_000_00);
    const workerWallet = await walletFor(worker.userId, 'WORKER');
    expect(workerWallet.pending).toBe(0);
    expect(workerWallet.available).toBe(0);
  });

  it('splits a partial refund between both parties', async () => {
    const { employer, worker, taskId, assignmentId, budget } = await setup();
    const held = await holdInEscrow({
      assignmentId, employerUserId: employer.userId, companyId: employer.companyId,
      workerUserId: worker.userId, taskId, grossMinor: budget, idempotencyKey: `escrow:${assignmentId}`,
    });

    const workerShare = budget / 2;
    const result = await refundPayment({
      paymentId: held.paymentId,
      actorId: employer.userId,
      reason: 'Dispute resolved as a split',
      amountMinor: budget - workerShare,
    });

    expect(result.refunded).toBe(budget - workerShare);
    // The worker keeps their half less the platform fee on that half.
    const { net } = splitFee(workerShare, 1000);
    expect(result.paidToWorker).toBe(net);
    expect((await walletFor(worker.userId, 'WORKER')).available).toBe(net);
  });
});

describe.skipIf(!hasDatabase)('ledger integrity', () => {
  useCleanDatabase();

  it('rejects updates to ledger entries', async () => {
    const sql = testDb();
    const employer = await createEmployer('ledger@test.local');
    const walletId = await fundEmployer(employer.userId, 10_000_00);

    await expect(
      sql`UPDATE transactions SET amount = 1 WHERE wallet_id = ${walletId}`,
    ).rejects.toThrow(/append-only/i);
  });

  it('rejects deletes from the ledger', async () => {
    const sql = testDb();
    const employer = await createEmployer('ledger2@test.local');
    const walletId = await fundEmployer(employer.userId, 10_000_00);

    await expect(
      sql`DELETE FROM transactions WHERE wallet_id = ${walletId}`,
    ).rejects.toThrow(/append-only/i);
  });

  it('rejects a negative wallet balance at the database level', async () => {
    const sql = testDb();
    const employer = await createEmployer('negative@test.local');
    const walletId = await fundEmployer(employer.userId, 1_000_00);

    await expect(
      sql`UPDATE wallets SET balance_available = -1 WHERE id = ${walletId}`,
    ).rejects.toThrow();
  });

  it('rejects a payment whose fee and net do not sum to the gross', async () => {
    const sql = testDb();
    await expect(
      sql`
        INSERT INTO payments (reference, gross_amount, platform_fee, net_amount, currency, status, provider, idempotency_key)
        VALUES ('KZ-BAD-1', 10000, 500, 9000, 'KES', 'PENDING', 'mock', 'bad-split')
      `,
    ).rejects.toThrow(/chk_payment_split/);
  });
});

describe.skipIf(!hasDatabase)('payouts', () => {
  useCleanDatabase();

  it('debits the wallet and refuses to withdraw more than the balance', async () => {
    const sql = testDb();
    const worker = await createWorker('payout@test.local');

    await sql`
      INSERT INTO wallets (owner_id, kind, currency, balance_available)
      VALUES (${worker.userId}, 'WORKER', 'KES', 30_000_00)
    `;

    await requestPayout({
      userId: worker.userId,
      amountMinor: 20_000_00,
      destinationPhone: '+254712345678',
      idempotencyKey: 'payout-1',
    });

    expect((await walletFor(worker.userId, 'WORKER')).available).toBe(10_000_00);

    await expect(
      requestPayout({
        userId: worker.userId,
        amountMinor: 50_000_00,
        destinationPhone: '+254712345678',
        idempotencyKey: 'payout-2',
      }),
    ).rejects.toThrow(/balance/i);

    expect((await walletFor(worker.userId, 'WORKER')).available).toBe(10_000_00);
  });

  it('enforces the minimum withdrawal', async () => {
    const sql = testDb();
    const worker = await createWorker('smallpayout@test.local');
    await sql`
      INSERT INTO wallets (owner_id, kind, currency, balance_available)
      VALUES (${worker.userId}, 'WORKER', 'KES', 50_000_00)
    `;

    await expect(
      requestPayout({
        userId: worker.userId,
        amountMinor: 100,
        destinationPhone: '+254712345678',
        idempotencyKey: 'payout-tiny',
      }),
    ).rejects.toThrow(/minimum/i);
  });
});
