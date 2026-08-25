import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTask } from '@/lib/domain/opportunities';
import { getAuthContext } from '@/lib/auth/session';
import { getEnv } from '@/lib/config/env';
import { formatKes } from '@/lib/i18n';
import { Alert, Card, PageHeader, VerificationBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const task = await getTask(id).catch(() => null);
  if (!task) return { title: 'Task not found' };
  return { title: task.title, description: task.description.slice(0, 160) };
}

export default async function PublicTaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task || task.status !== 'PUBLISHED') notFound();

  const auth = await getAuthContext().catch(() => null);
  if (auth?.user.role === 'WORKER') {
    return (
      <Card>
        <p className="text-sm">Opening this task with your match details…</p>
        <Link href={`/worker/tasks/${task.id}`} className="btn btn-primary mt-3">
          Continue
        </Link>
      </Card>
    );
  }

  const budget = Number(task.budget_amount);
  const net = budget - Math.round((budget * getEnv().PLATFORM_FEE_BPS) / 10_000);

  return (
    <>
      <PageHeader title={task.title} description={`${task.company_name} · ${task.category}`} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="flex flex-wrap gap-2">
            <VerificationBadge tier={task.verification_tier} />
            <span className="badge border surface-sunken">{task.requires_location ? task.region_name ?? 'On-site' : 'Remote'}</span>
            {task.requires_laptop ? <span className="badge border surface-sunken">Laptop required</span> : null}
          </div>

          <div className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">{task.description}</div>

          <h2 className="mt-5 font-semibold">What you must deliver</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{task.expected_output}</p>
        </Card>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <p className="text-sm text-muted">Budget</p>
            <p className="text-2xl font-bold tabular-nums">{formatKes(budget)}</p>
            <p className="mt-1 text-sm text-secondary">You would receive {formatKes(net)} after the platform fee.</p>

            <Link href={`/signup?role=worker&next=${encodeURIComponent(`/worker/tasks/${task.id}`)}`} className="btn btn-primary mt-4 w-full">
              Create free account to apply
            </Link>
            <Link href={`/login?next=${encodeURIComponent(`/worker/tasks/${task.id}`)}`} className="btn btn-secondary mt-2 w-full">
              Sign in
            </Link>
          </Card>

          <Alert tone="info" title="Payment protection">
            When an employer accepts you, the full budget is locked in escrow before you start. It is
            released to you when your work is approved.
          </Alert>
        </div>
      </div>
    </>
  );
}
