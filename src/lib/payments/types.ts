/**
 * Payment provider boundary.
 *
 * The ledger above this interface is provider-agnostic: it moves money between
 * wallets in KES minor units and knows nothing about STK pushes or card rails.
 * Adding a provider means implementing this interface — no ledger changes.
 *
 * No provider implementation may persist a PIN, a card number, or any
 * credential belonging to a payer. Providers hold API credentials from the
 * environment and reference identifiers only.
 */

export type PaymentIntentStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface PaymentIntent {
  /** Provider-side reference used to reconcile and to verify later. */
  providerReference: string;
  status: PaymentIntentStatus;
  /** Where to send the user to complete payment, if the rail needs it. */
  redirectUrl?: string;
  /** Copy shown to the payer, e.g. "Check your phone for the M-Pesa prompt." */
  userInstruction?: string;
  raw?: Record<string, unknown>;
}

export interface PaymentVerification {
  providerReference: string;
  status: PaymentIntentStatus;
  amountMinor: number;
  currency: string;
  /** Provider's own transaction id, e.g. an M-Pesa receipt number. */
  externalId?: string;
  failureReason?: string;
  raw?: Record<string, unknown>;
}

export interface PayoutResult {
  providerReference: string;
  status: PaymentIntentStatus;
  externalId?: string;
  failureReason?: string;
  raw?: Record<string, unknown>;
}

export interface InitiatePaymentInput {
  amountMinor: number;
  currency: string;
  /** KaziOS-side reference; providers echo it back for reconciliation. */
  reference: string;
  description: string;
  /** E.164. Required by mobile-money rails. */
  payerPhone?: string | null;
  payerEmail?: string | null;
  /** Makes retries safe across the whole stack. */
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface PayoutInput {
  amountMinor: number;
  currency: string;
  reference: string;
  /** E.164 destination for mobile money. */
  destinationPhone: string;
  description: string;
  idempotencyKey: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** False when the provider is a stub or not yet configured for live money. */
  readonly isLive: boolean;

  /** Ask the payer for money. */
  initiatePayment(input: InitiatePaymentInput): Promise<PaymentIntent>;

  /** Confirm what actually happened. Never trust the initiate response alone. */
  verifyPayment(providerReference: string): Promise<PaymentVerification>;

  /**
   * Release funds held for completed work.
   *
   * On rails where money never leaves KaziOS custody, this is a ledger-only
   * operation and the provider simply acknowledges it; on rails that hold
   * funds themselves it triggers a real settlement.
   */
  releasePayment(providerReference: string, amountMinor: number): Promise<PaymentVerification>;

  /** Return money to the payer. */
  refundPayment(providerReference: string, amountMinor: number, reason: string): Promise<PaymentVerification>;

  /** Send money out to a worker. */
  payout(input: PayoutInput): Promise<PayoutResult>;

  /** Validate and normalise an inbound webhook. */
  parseWebhook(payload: unknown, headers: Record<string, string>): Promise<PaymentVerification | null>;
}
