import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { getWalletSummary, listTransactions, MIN_PAYOUT_MINOR } from '@/lib/payments/service';
import { formatKes } from '@/lib/i18n';
import { Alert, Card, PageHeader, SectionHeading, Stat } from '@/components/ui';
import { WithdrawPanel } from './withdraw-panel';

export const metadata: Metadata = { title: 'Your earnings' };
export const dynamic = 'force-dynamic';

export default async function EarningsPage() {
  const auth = await requireAuth(['WORKER']);

  const [wallet, transactions, pending] = await Promise.all([
    getWalletSummary(auth.user.id, 'WORKER'),
    listTransactions(auth.user.id, 'WORKER', { limit: 30 }),
    sql<Array<{ task_title: string; net_amount: string; held_at: Date | null }>>`
      SELECT t.title AS task_title, p.net_amount, p.held_at
      FROM payments p JOIN tasks t ON t.id = p.task_id
      WHERE p.payee_user_id = ${auth.user.id} AND p.status = 'HELD_IN_ESCROW'
      ORDER BY p.held_at DESC
    `,
  ]);

  return (
    <>
      <PageHeader title="Your earnings" description="Everything you have earned on KaziOS, and what is on its way." />

      {!wallet.paymentsAreLive ? (
        <div className="mb-6">
          <Alert tone="warning" title="Simulated payments">
            This deployment runs a development payment provider. Balances and the ledger are real, but
            no money moves in or out until a live provider is configured.
          </Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Available now" value={formatKes(wallet.available)} tone="jade" hint="Ready to withdraw" />
        <Stat label="Held in escrow" value={formatKes(wallet.pending)} hint="Released when work is approved" />
        <Stat label="Earned to date" value={formatKes(wallet.lifetimeEarned)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <WithdrawPanel
            available={wallet.available}
            minimum={MIN_PAYOUT_MINOR}
            phoneVerified={Boolean(auth.user.phoneVerifiedAt)}
            phone={auth.user.phone}
          />

          {pending.length > 0 ? (
            <div className="mt-6">
              <SectionHeading title="Money on its way" />
              <ul className="space-y-2">
                {pending.map((item, index) => (
                  <li key={`${item.task_title}-${index}`} className="card flex items-center justify-between gap-3 p-3">
                    <span className="min-w-0 truncate text-sm">{item.task_title}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatKes(Number(item.net_amount))}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted">
                This money is already locked in escrow by the employer. It reaches your available
                balance as soon as your work is approved.
              </p>
            </div>
          ) : null}
        </div>

        <div>
          <SectionHeading title="Transaction history" />
          {transactions.items.length === 0 ? (
            <Card>
              <p className="text-sm text-secondary">
                No transactions yet. Your first paid task will appear here.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {transactions.items.map((transaction) => (
                <li key={transaction.id} className="card flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{transaction.description}</p>
                    <p className="text-xs text-muted">
                      {new Date(transaction.createdAt).toLocaleString('en-KE')}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${
                      transaction.direction === 'CREDIT' ? 'text-jade-600 dark:text-jade-300' : ''
                    }`}
                  >
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
