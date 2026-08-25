import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { requireEmployer } from '@/lib/domain/employers';
import { getWalletSummary, listTransactions } from '@/lib/payments/service';
import { sql } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';
import { formatKes } from '@/lib/i18n';
import { Alert, Card, PageHeader, SectionHeading, Stat } from '@/components/ui';
import { DepositPanel } from './deposit-panel';

export const metadata: Metadata = { title: 'Billing' };
export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const auth = await requireAuth(['EMPLOYER']);
  const employer = await requireEmployer(auth.user.id);

  const [wallet, transactions, escrow] = await Promise.all([
    getWalletSummary(auth.user.id, 'EMPLOYER'),
    listTransactions(auth.user.id, 'EMPLOYER', { limit: 30 }),
    sql<Array<{ reference: string; task_title: string; worker_name: string | null; gross_amount: string }>>`
      SELECT p.reference, t.title AS task_title, u.full_name AS worker_name, p.gross_amount
      FROM payments p
      JOIN tasks t ON t.id = p.task_id
      LEFT JOIN users u ON u.id = p.payee_user_id
      WHERE p.payer_company_id = ${employer.companyId} AND p.status = 'HELD_IN_ESCROW'
      ORDER BY p.held_at DESC
    `,
  ]);

  const feePercent = getEnv().PLATFORM_FEE_BPS / 100;

  return (
    <>
      <PageHeader title="Billing" description="Your balance funds escrow. Workers only see a task as fundable when the money is there." />

      {!wallet.paymentsAreLive ? (
        <div className="mb-6">
          <Alert tone="warning" title="Simulated payments">
            A development payment provider is active. Top-ups settle instantly and no real money moves.
          </Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Available" value={formatKes(wallet.available)} tone="jade" hint="Can be committed to new work" />
        <Stat label="In escrow" value={formatKes(wallet.escrow)} hint="Committed to active tasks" />
        <Stat label="Total spent" value={formatKes(wallet.lifetimeSpent)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <DepositPanel />

          <Card>
            <h2 className="font-semibold">How charging works</h2>
            <ul className="mt-2 space-y-2 text-sm text-secondary">
              <li>
                <span className="font-medium">Task fee: </span>
                KaziOS takes {feePercent}% of each task payment. The worker sees this before they apply,
                and their net figure is shown on every task.
              </li>
              <li>
                <span className="font-medium">Job postings: </span>
                free during the pilot.
              </li>
              <li>
                <span className="font-medium">Workers are never charged: </span>
                no fee to apply, and no fee to access work. That is a hard rule on this platform.
              </li>
            </ul>
          </Card>

          {escrow.length > 0 ? (
            <div>
              <SectionHeading title="Currently in escrow" />
              <ul className="space-y-2">
                {escrow.map((item) => (
                  <li key={item.reference} className="card flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.task_title}</p>
                      <p className="text-xs text-muted">{item.worker_name ?? 'Unassigned'} · {item.reference}</p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatKes(Number(item.gross_amount))}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div>
          <SectionHeading title="Transaction history" />
          {transactions.items.length === 0 ? (
            <Card>
              <p className="text-sm text-secondary">No transactions yet.</p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {transactions.items.map((transaction) => (
                <li key={transaction.id} className="card flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{transaction.description}</p>
                    <p className="text-xs text-muted">{new Date(transaction.createdAt).toLocaleString('en-KE')}</p>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums ${transaction.direction === 'CREDIT' ? 'text-jade-600 dark:text-jade-300' : ''}`}>
                    {transaction.direction === 'CREDIT' ? '+' : '−'}
                    {formatKes(transaction.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
