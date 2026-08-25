/**
 * Structured application errors.
 *
 * Every failure that reaches an API boundary is one of these. The HTTP layer
 * turns them into a consistent JSON envelope; anything else that escapes is
 * treated as a 500 and its message is *not* forwarded to the client, so stack
 * traces and driver errors can never leak.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PRECONDITION_FAILED'
  | 'INSUFFICIENT_FUNDS'
  | 'PROVIDER_ERROR'
  | 'AI_UNAVAILABLE'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PRECONDITION_FAILED: 412,
  INSUFFICIENT_FUNDS: 402,
  PROVIDER_ERROR: 502,
  AI_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  INTERNAL_ERROR: 500,
};

/** Per-field validation messages, keyed by dotted field path. */
export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: FieldErrors;
  readonly details?: Record<string, unknown>;
  /** Seconds the client should wait before retrying. Sets Retry-After. */
  readonly retryAfter?: number;

  constructor(
    code: ErrorCode,
    message: string,
    options: { fields?: FieldErrors; details?: Record<string, unknown>; retryAfter?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fields = options.fields;
    this.details = options.details;
    this.retryAfter = options.retryAfter;
  }
}

export const badRequest = (message = 'The request could not be understood.', details?: Record<string, unknown>) =>
  new AppError('BAD_REQUEST', message, { details });

export const validationFailed = (fields: FieldErrors, message = 'Please correct the highlighted fields.') =>
  new AppError('VALIDATION_FAILED', message, { fields });

export const unauthenticated = (message = 'You need to sign in to continue.') =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError('FORBIDDEN', message);

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} was not found.`);

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError('CONFLICT', message, { details });

export const rateLimited = (retryAfter: number, message = 'Too many requests. Please slow down.') =>
  new AppError('RATE_LIMITED', message, { retryAfter });

export const preconditionFailed = (message: string, details?: Record<string, unknown>) =>
  new AppError('PRECONDITION_FAILED', message, { details });

export const insufficientFunds = (message = 'There is not enough balance to complete this payment.') =>
  new AppError('INSUFFICIENT_FUNDS', message);

export const providerError = (message: string, cause?: unknown) =>
  new AppError('PROVIDER_ERROR', message, { cause });

export const notImplemented = (message: string) => new AppError('NOT_IMPLEMENTED', message);

export const internalError = (message = 'Something went wrong on our side.', cause?: unknown) =>
  new AppError('INTERNAL_ERROR', message, { cause });

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
