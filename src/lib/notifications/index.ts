/**
 * Notifications.
 *
 * Every notification is persisted first and delivered second, so the in-app
 * feed is always complete even when an email bounces. Channel is an enum in
 * the schema, so adding SMS or WhatsApp is a provider implementation, not a
 * migration — which matters here, because a large share of Kenyan workers will
 * reach this platform through a messaging app rather than email.
 */
import 'server-only';
import { json, sql, type Db } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface NotificationInput {
  userId: string;
  kind: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  channels?: NotificationChannel[];
  payload?: Record<string, unknown>;
}

export interface DeliveryProvider {
  readonly name: string;
  readonly supports: NotificationChannel[];
  send(input: {
    channel: NotificationChannel;
    to: string;
    subject: string;
    body: string;
    actionUrl?: string | null;
  }): Promise<{ delivered: boolean; error?: string }>;
}

/** Development provider: logs instead of sending. */
class ConsoleDeliveryProvider implements DeliveryProvider {
  readonly name = 'console';
  readonly supports: NotificationChannel[] = ['IN_APP', 'EMAIL'];

  async send(input: { channel: NotificationChannel; to: string; subject: string; body: string }) {
    console.log(`[notify:${input.channel}] -> ${input.to}\n  ${input.subject}\n  ${input.body}`);
    return { delivered: true };
  }
}

/**
 * SMTP email delivery — PENDING INTEGRATION.
 *
 * Wiring this up needs a mail transport dependency (nodemailer or an HTTP API
 * such as Resend or Postmark). The interface and configuration surface are in
 * place; the transport is deliberately not stubbed with a fake success, because
 * silently "delivering" a password-reset email that never arrives is worse than
 * a loud failure. Configuration lives in docs/DEPLOYMENT.md; the known gap is
 * recorded in docs/SECURITY.md.
 */
class SmtpDeliveryProvider implements DeliveryProvider {
  readonly name = 'smtp';
  readonly supports: NotificationChannel[] = ['EMAIL'];

  async send(): Promise<{ delivered: boolean; error?: string }> {
    return {
      delivered: false,
      error:
        'SMTP delivery is not implemented yet. Add a mail transport in src/lib/notifications, ' +
        'or set NOTIFICATION_PROVIDER=console for development.',
    };
  }
}

let providerInstance: DeliveryProvider | null = null;

export function getDeliveryProvider(): DeliveryProvider {
  if (providerInstance) return providerInstance;
  providerInstance =
    getEnv().NOTIFICATION_PROVIDER === 'smtp' ? new SmtpDeliveryProvider() : new ConsoleDeliveryProvider();
  return providerInstance;
}

/** Test seam. */
export function setDeliveryProvider(provider: DeliveryProvider | null): void {
  providerInstance = provider;
}

/**
 * Create and deliver a notification.
 *
 * The in-app row is always written. External delivery is attempted for the
 * requested channels and recorded per row, so a failed email is visible rather
 * than lost.
 */
export async function notify(input: NotificationInput, db: Db = sql): Promise<void> {
  const channels = input.channels ?? ['IN_APP'];

  const recipients = await db<{ email: string; phone: string | null; full_name: string }[]>`
    SELECT email, phone, full_name FROM users WHERE id = ${input.userId} AND deleted_at IS NULL
  `;
  const recipient = recipients[0];
  if (!recipient) return;

  for (const channel of channels) {
    const rows = await db<{ id: string }[]>`
      INSERT INTO notifications (user_id, channel, kind, title, body, action_url, payload, state)
      VALUES (
        ${input.userId}, ${channel}, ${input.kind}, ${input.title}, ${input.body},
        ${input.actionUrl ?? null}, ${json(input.payload ?? {})},
        ${channel === 'IN_APP' ? 'SENT' : 'QUEUED'}
      )
      RETURNING id
    `;
    const notificationId = rows[0]?.id;
    if (!notificationId || channel === 'IN_APP') continue;

    const destination = channel === 'EMAIL' ? recipient.email : (recipient.phone ?? '');
    if (!destination) {
      await db`
        UPDATE notifications SET state = 'FAILED', error = 'No destination on file for this channel.'
        WHERE id = ${notificationId}
      `;
      continue;
    }

    const provider = getDeliveryProvider();
    if (!provider.supports.includes(channel)) {
      await db`
        UPDATE notifications
        SET state = 'FAILED', error = ${`${channel} delivery is not enabled on this deployment.`}
        WHERE id = ${notificationId}
      `;
      continue;
    }

    const result = await provider.send({
      channel,
      to: destination,
      subject: input.title,
      body: input.body,
      actionUrl: input.actionUrl ?? null,
    });

    await db`
      UPDATE notifications
      SET state = ${result.delivered ? 'SENT' : 'FAILED'},
          sent_at = ${result.delivered ? sql`now()` : null},
          error = ${result.error ?? null}
      WHERE id = ${notificationId}
    `;
  }
}

/**
 * Notification templates.
 *
 * Centralised so wording stays consistent and so nothing accidentally promises
 * an outcome the platform cannot deliver.
 */
export const NOTIFICATIONS = {
  applicationSubmitted: (jobTitle: string, company: string) => ({
    kind: 'application.submitted',
    title: 'Application sent',
    body: `Your application for ${jobTitle} at ${company} has been sent. You will be notified when the employer reviews it.`,
  }),
  applicationShortlisted: (jobTitle: string, company: string) => ({
    kind: 'application.shortlisted',
    title: 'You have been shortlisted',
    body: `${company} has shortlisted you for ${jobTitle}. Keep an eye out for a message from them.`,
  }),
  applicationRejected: (jobTitle: string) => ({
    kind: 'application.rejected',
    title: 'Application update',
    body: `You were not selected for ${jobTitle} this time. Your profile stays active for other opportunities — the fastest way to improve your odds is to add verified evidence of your skills.`,
  }),
  newApplicant: (jobTitle: string, count: number) => ({
    kind: 'application.received',
    title: `New applicant for ${jobTitle}`,
    body: `You have ${count} applicant(s) waiting for review.`,
  }),
  taskAssigned: (taskTitle: string, amount: string) => ({
    kind: 'task.assigned',
    title: 'You have been assigned a task',
    body: `You have been selected for "${taskTitle}". ${amount} has been locked in escrow and will be released to you when your work is approved.`,
  }),
  taskSubmitted: (taskTitle: string, worker: string) => ({
    kind: 'task.submitted',
    title: 'Work submitted for review',
    body: `${worker} has submitted work for "${taskTitle}". Review and approve it to release payment.`,
  }),
  workApproved: (taskTitle: string, amount: string) => ({
    kind: 'work.approved',
    title: 'Your work was approved',
    body: `Your work on "${taskTitle}" was approved and ${amount} has been added to your available balance.`,
  }),
  revisionRequested: (taskTitle: string) => ({
    kind: 'work.revision_requested',
    title: 'Revision requested',
    body: `The employer has asked for changes to your work on "${taskTitle}". Read their notes and resubmit.`,
  }),
  paymentReleased: (amount: string) => ({
    kind: 'payment.released',
    title: 'Payment received',
    body: `${amount} has been released to your KaziOS balance. You can withdraw it to your mobile money account.`,
  }),
  simulationEvaluated: (title: string, score: number) => ({
    kind: 'simulation.evaluated',
    title: 'Your simulation has been assessed',
    body: `You scored ${score}/100 on "${title}". Open your results to see the feedback and what to improve.`,
  }),
  verificationApproved: (kind: string) => ({
    kind: 'verification.approved',
    title: 'Verification approved',
    body: `Your ${kind.toLowerCase().replace(/_/g, ' ')} verification has been approved.`,
  }),
  verificationRejected: (kind: string, reason: string) => ({
    kind: 'verification.rejected',
    title: 'Verification needs attention',
    body: `Your ${kind.toLowerCase().replace(/_/g, ' ')} verification could not be approved: ${reason}`,
  }),
  disputeOpened: (reference: string) => ({
    kind: 'dispute.opened',
    title: 'A dispute has been opened',
    body: `Dispute ${reference} has been opened on work you are involved in. An administrator will review it. Funds remain held until it is resolved.`,
  }),
  disputeResolved: (reference: string, outcome: string) => ({
    kind: 'dispute.resolved',
    title: 'Dispute resolved',
    body: `Dispute ${reference} has been resolved: ${outcome}`,
  }),
} as const;

export async function markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE notifications SET read_at = now()
    WHERE id = ${notificationId} AND user_id = ${userId} AND read_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND read_at IS NULL RETURNING id
  `;
  return rows.length;
}

export async function unreadCount(userId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM notifications WHERE user_id = ${userId} AND read_at IS NULL
  `;
  return Number(rows[0]?.count ?? 0);
}
