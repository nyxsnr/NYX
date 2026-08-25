/**
 * M-Pesa (Safaricom Daraja) provider — PENDING LIVE VERIFICATION.
 *
 * Status: the request/response shapes below follow the Daraja v1/v2 API
 * (OAuth, Lipa Na M-Pesa Online / STK Push, transaction status query, and B2C
 * payout). The code is complete and configured entirely from environment
 * variables, but it has NOT been exercised against a live Safaricom sandbox in
 * this build. Treat it as integration-ready, not integration-verified.
 *
 * Before switching PAYMENT_PROVIDER=mpesa in production:
 *   1. Complete Safaricom Daraja onboarding and obtain a live shortcode.
 *   2. Verify the STK push and callback round-trip in the sandbox.
 *   3. Implement callback signature/IP validation in `parseWebhook` — the
 *      Daraja callback is unauthenticated, so the callback URL must be treated
 *      as a public endpoint and every result re-verified with `verifyPayment`.
 *   4. Confirm B2C settlement timing and the initiator security credential.
 *
 * Until those are done the provider refuses to start rather than silently
 * failing to move a worker's money. See docs/PAYMENTS.md.
 *
 * No PIN, and no payer credential of any kind, is ever received or stored by
 * this code: the customer authorises on their own handset.
 */
import 'server-only';
import { getEnv } from '@/lib/config/env';
import { AppError, providerError } from '@/lib/http/errors';
import type {
  InitiatePaymentInput,
  PaymentIntent,
  PaymentProvider,
  PaymentVerification,
  PayoutInput,
  PayoutResult,
} from '../types';

const BASE_URLS = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
} as const;

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class MpesaProvider implements PaymentProvider {
  readonly name = 'mpesa';
  readonly isLive = true;

  private tokenCache: TokenCache | null = null;
  private readonly baseUrl: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly shortcode: string;
  private readonly passkey: string;
  private readonly callbackUrl: string;

  constructor() {
    const env = getEnv();
    const missing = (
      [
        ['MPESA_CONSUMER_KEY', env.MPESA_CONSUMER_KEY],
        ['MPESA_CONSUMER_SECRET', env.MPESA_CONSUMER_SECRET],
        ['MPESA_SHORTCODE', env.MPESA_SHORTCODE],
        ['MPESA_PASSKEY', env.MPESA_PASSKEY],
        ['MPESA_CALLBACK_URL', env.MPESA_CALLBACK_URL],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new AppError(
        'NOT_IMPLEMENTED',
        `M-Pesa is selected but not configured. Missing: ${missing.join(', ')}. ` +
          'See docs/PAYMENTS.md for the Daraja onboarding checklist, or set PAYMENT_PROVIDER=mock for development.',
      );
    }

    this.baseUrl = BASE_URLS[env.MPESA_ENVIRONMENT];
    this.consumerKey = env.MPESA_CONSUMER_KEY as string;
    this.consumerSecret = env.MPESA_CONSUMER_SECRET as string;
    this.shortcode = env.MPESA_SHORTCODE as string;
    this.passkey = env.MPESA_PASSKEY as string;
    this.callbackUrl = env.MPESA_CALLBACK_URL as string;
  }

  /** OAuth token, cached until shortly before expiry. */
  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }

    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (!response.ok) {
      throw providerError(`M-Pesa authentication failed (HTTP ${response.status}).`);
    }

    const body = (await response.json()) as { access_token?: string; expires_in?: string };
    if (!body.access_token) throw providerError('M-Pesa returned no access token.');

    this.tokenCache = {
      token: body.access_token,
      expiresAt: Date.now() + Number(body.expires_in ?? 3599) * 1000,
    };
    return body.access_token;
  }

  private async call<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw providerError(`M-Pesa returned a non-JSON response (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      const err = body as { errorMessage?: string; errorCode?: string };
      throw providerError(`M-Pesa error ${err.errorCode ?? response.status}: ${err.errorMessage ?? 'unknown'}.`);
    }
    return body as T;
  }

  /** Daraja timestamp format: YYYYMMDDHHmmss, East Africa Time. */
  private timestamp(): string {
    const now = new Date();
    const eat = new Date(now.getTime() + 3 * 3_600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}` +
      `${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`
    );
  }

  private password(timestamp: string): string {
    return Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
  }

  /** M-Pesa transacts in whole shillings; our ledger is in cents. */
  private toShillings(amountMinor: number): number {
    if (amountMinor % 100 !== 0) {
      throw new AppError(
        'BAD_REQUEST',
        'M-Pesa accepts whole shillings only. Round the amount before charging.',
      );
    }
    return amountMinor / 100;
  }

  private msisdn(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('254')) return digits;
    if (digits.startsWith('0')) return `254${digits.slice(1)}`;
    return `254${digits}`;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<PaymentIntent> {
    if (!input.payerPhone) {
      throw new AppError('BAD_REQUEST', 'A verified phone number is required to pay with M-Pesa.');
    }

    const timestamp = this.timestamp();
    const body = await this.call<{
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResponseCode: string;
      ResponseDescription: string;
      CustomerMessage: string;
    }>('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: this.shortcode,
      Password: this.password(timestamp),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: this.toShillings(input.amountMinor),
      PartyA: this.msisdn(input.payerPhone),
      PartyB: this.shortcode,
      PhoneNumber: this.msisdn(input.payerPhone),
      CallBackURL: this.callbackUrl,
      // Daraja truncates these; keep them short and reconcilable.
      AccountReference: input.reference.slice(0, 12),
      TransactionDesc: input.description.slice(0, 13),
    });

    return {
      providerReference: body.CheckoutRequestID,
      // Accepted for processing — never treat this as payment received.
      status: body.ResponseCode === '0' ? 'PROCESSING' : 'FAILED',
      userInstruction: body.CustomerMessage ?? 'Check your phone and enter your M-Pesa PIN to authorise.',
      raw: { ...body },
    };
  }

  async verifyPayment(providerReference: string): Promise<PaymentVerification> {
    const timestamp = this.timestamp();
    const body = await this.call<{
      ResultCode: string;
      ResultDesc: string;
      Amount?: string;
      MpesaReceiptNumber?: string;
    }>('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: this.shortcode,
      Password: this.password(timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: providerReference,
    });

    const succeeded = body.ResultCode === '0';
    return {
      providerReference,
      status: succeeded ? 'SUCCEEDED' : body.ResultCode === '1032' ? 'CANCELLED' : 'FAILED',
      amountMinor: body.Amount ? Math.round(Number(body.Amount) * 100) : 0,
      currency: 'KES',
      externalId: body.MpesaReceiptNumber,
      failureReason: succeeded ? undefined : body.ResultDesc,
      raw: { ...body },
    };
  }

  /**
   * Funds collected via STK push sit in the KaziOS paybill, so release to a
   * worker is a ledger movement followed by a payout, not a provider call.
   * The ledger records the release; `payout` moves it off-platform.
   */
  async releasePayment(providerReference: string, amountMinor: number): Promise<PaymentVerification> {
    return {
      providerReference,
      status: 'SUCCEEDED',
      amountMinor,
      currency: 'KES',
      raw: { note: 'Escrow release is a ledger operation; settlement happens on payout.' },
    };
  }

  async refundPayment(providerReference: string, amountMinor: number, reason: string): Promise<PaymentVerification> {
    // Daraja reversal requires the initiator security credential and is
    // operationally sensitive, so refunds are routed to a B2C payout back to
    // the payer instead — the same rail workers are paid on.
    throw new AppError(
      'NOT_IMPLEMENTED',
      'M-Pesa refunds are processed as a B2C payout back to the payer and require operator approval. ' +
        'Raise a dispute so an administrator can action it. See docs/PAYMENTS.md.',
      { details: { providerReference, amountMinor, reason } },
    );
  }

  async payout(input: PayoutInput): Promise<PayoutResult> {
    // B2C additionally requires MPESA_INITIATOR_NAME and an encrypted
    // SecurityCredential, which are not part of the MVP configuration surface.
    throw new AppError(
      'NOT_IMPLEMENTED',
      'M-Pesa B2C payouts are not enabled yet. They require an initiator name and encrypted security credential ' +
        'from Safaricom, plus float funding on the shortcode. See docs/PAYMENTS.md for the checklist.',
      { details: { reference: input.reference, amountMinor: input.amountMinor } },
    );
  }

  /**
   * Daraja posts callbacks unauthenticated. Anything arriving here is treated
   * as a hint only: the caller re-verifies with `verifyPayment` before any
   * money moves, so a forged callback cannot credit an account.
   */
  async parseWebhook(payload: unknown): Promise<PaymentVerification | null> {
    const body = payload as {
      Body?: {
        stkCallback?: {
          CheckoutRequestID?: string;
          ResultCode?: number;
          ResultDesc?: string;
          CallbackMetadata?: { Item?: Array<{ Name: string; Value?: string | number }> };
        };
      };
    };

    const callback = body?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID) return null;

    const items = callback.CallbackMetadata?.Item ?? [];
    const findItem = (name: string) => items.find((i) => i.Name === name)?.Value;
    const amount = Number(findItem('Amount') ?? 0);

    return {
      providerReference: callback.CheckoutRequestID,
      status: callback.ResultCode === 0 ? 'SUCCEEDED' : 'FAILED',
      amountMinor: Math.round(amount * 100),
      currency: 'KES',
      externalId: String(findItem('MpesaReceiptNumber') ?? ''),
      failureReason: callback.ResultCode === 0 ? undefined : callback.ResultDesc,
      raw: { ...callback },
    };
  }
}
