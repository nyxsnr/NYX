import { route } from '@/lib/http/handler';
import { ok } from '@/lib/http/response';
import { sql } from '@/lib/db/client';
import { offsetFor, pagination } from '@/lib/validation/common';
import { requireEmployer } from '@/lib/domain/employers';
import { getWalletSummary, listTransactions } from '@/lib/payments/service';
import { getEnv } from '@/lib/config/env';

export const GET = route({ query: pagination, auth: 'required', roles: ['EMPLOYER'] }, async (ctx) => {
  const employer = await requireEmployer(ctx.auth.user.id);

  const [wallet, transactions, escrow] = await Promise.all([
    getWalletSummary(ctx.auth.user.id, 'EMPLOYER'),
    listTransactions(ctx.auth.user.id, 'EMPLOYER', { limit: ctx.query.pageSize, offset: offsetFor(ctx.query) }),
    sql<Array<{ reference: string; task_title: string; worker_name: string; gross_amount: string; currency: string; held_at: Date | null }>>`
      SELECT p.reference, t.title AS task_title, u.full_name AS worker_name,
             p.gross_amount, p.currency, p.held_at
      FROM payments p
      JOIN tasks t ON t.id = p.task_id
      LEFT JOIN users u ON u.id = p.payee_user_id
      WHERE p.payer_company_id = ${employer.companyId} AND p.status = 'HELD_IN_ESCROW'
      ORDER BY p.held_at DESC
    `,
  ]);

  return ok({
    wallet,
    platformFeeBps: getEnv().PLATFORM_FEE_BPS,
    transactions: transactions.items,
    transactionTotal: transactions.total,
    escrowCommitments: escrow.map((e) => ({
      reference: e.reference,
      taskTitle: e.task_title,
      workerName: e.worker_name,
      amount: Number(e.gross_amount),
      currency: e.currency,
      heldAt: e.held_at,
    })),
    notice: wallet.paymentsAreLive
      ? null
      : 'Simulated payments are active on this deployment. Ledger entries are real; no money leaves or enters any account.',
  });
});
