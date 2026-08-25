import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { offsetFor, pagination } from '@/lib/validation/common';
import { getWalletSummary, listTransactions, MIN_PAYOUT_MINOR } from '@/lib/payments/service';

/** Wallet, ledger and upcoming income for one worker. */
export const GET = route(
  { query: pagination, auth: 'required', roles: ['WORKER'], permission: 'worker:wallet:read' },
  async (ctx) => {
    const [wallet, transactions, upcoming] = await Promise.all([
      getWalletSummary(ctx.auth.user.id, 'WORKER'),
      listTransactions(ctx.auth.user.id, 'WORKER', {
        limit: ctx.query.pageSize,
        offset: offsetFor(ctx.query),
      }),
      sql<Array<{ task_title: string; net_amount: string; currency: string; held_at: Date | null }>>`
        SELECT t.title AS task_title, p.net_amount, p.currency, p.held_at
        FROM payments p
        JOIN tasks t ON t.id = p.task_id
        WHERE p.payee_user_id = ${ctx.auth.user.id} AND p.status = 'HELD_IN_ESCROW'
        ORDER BY p.held_at DESC
      `,
    ]);

    return ok({
      wallet,
      minimumPayout: MIN_PAYOUT_MINOR,
      transactions: transactions.items,
      transactionTotal: transactions.total,
      // Escrowed work: money committed to the worker but not yet released.
      pendingWork: upcoming.map((u) => ({
        taskTitle: u.task_title,
        amount: Number(u.net_amount),
        currency: u.currency,
        heldAt: u.held_at,
      })),
      notice: wallet.paymentsAreLive
        ? null
        : 'This deployment is running simulated payments. Balances are real ledger entries, but no money moves until a payment provider is configured.',
    });
  },
);
