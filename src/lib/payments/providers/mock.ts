/**
 * Development payment provider.
 *
 * Simulates the full lifecycle — initiate, verify, release, refund, payout —
 * without moving money, so the escrow ledger, task workflow and dashboards can
 * be exercised end-to-end offline. The ledger entries it produces are real:
 * only the external settlement is simulated.
 *
 * `isLive` is false, and every surface that shows money renders a clear
 * "simulated payments" notice while this provider is active. It is refused
 * silently by nothing — `getEnv()` warns when it is used in production.
 */
import { randomUUID } from 'node:crypto';
import type {
  InitiatePaymentInput,
  PaymentIntent,
  PaymentProvider,
  PaymentVerification,
  PayoutInput,
  PayoutResult,
} from '../types';

/** In-memory record of simulated intents, so verify() is consistent. */
const intents = new Map<string, PaymentVerification>();

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isLive = false;

  async initiatePayment(input: InitiatePaymentInput): Promise<PaymentIntent> {
    const providerReference = `MOCK-${input.reference}-${randomUUID().slice(0, 8)}`;

    // Deterministic simulated failure so error paths are exercised in demos:
    // any amount ending in 13 minor units fails.
    const willFail = input.amountMinor % 100 === 13;

    intents.set(providerReference, {
      providerReference,
      status: willFail ? 'FAILED' : 'SUCCEEDED',
      amountMinor: input.amountMinor,
      currency: input.currency,
      externalId: willFail ? undefined : `SIM${Date.now().toString(36).toUpperCase()}`,
      failureReason: willFail ? 'Simulated failure (amount ends in .13)' : undefined,
    });

    return {
      providerReference,
      status: willFail ? 'FAILED' : 'SUCCEEDED',
      userInstruction: willFail
        ? 'Simulated payment failure. Try a different amount.'
        : 'Simulated payment accepted. No real money has moved.',
      raw: { simulated: true },
    };
  }

  async verifyPayment(providerReference: string): Promise<PaymentVerification> {
    const known = intents.get(providerReference);
    if (known) return known;
    return {
      providerReference,
      status: 'FAILED',
      amountMinor: 0,
      currency: 'KES',
      failureReason: 'Unknown reference.',
    };
  }

  async releasePayment(providerReference: string, amountMinor: number): Promise<PaymentVerification> {
    return {
      providerReference,
      status: 'SUCCEEDED',
      amountMinor,
      currency: 'KES',
      externalId: `SIMREL${Date.now().toString(36).toUpperCase()}`,
      raw: { simulated: true },
    };
  }

  async refundPayment(providerReference: string, amountMinor: number, reason: string): Promise<PaymentVerification> {
    return {
      providerReference,
      status: 'SUCCEEDED',
      amountMinor,
      currency: 'KES',
      externalId: `SIMREF${Date.now().toString(36).toUpperCase()}`,
      raw: { simulated: true, reason },
    };
  }

  async payout(input: PayoutInput): Promise<PayoutResult> {
    return {
      providerReference: `MOCKOUT-${input.reference}`,
      status: 'SUCCEEDED',
      externalId: `SIMOUT${Date.now().toString(36).toUpperCase()}`,
      raw: { simulated: true, destination: input.destinationPhone },
    };
  }

  async parseWebhook(): Promise<PaymentVerification | null> {
    return null;
  }

  /** Test seam. */
  static reset(): void {
    intents.clear();
  }
}
