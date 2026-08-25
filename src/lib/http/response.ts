/**
 * The single JSON envelope every API route returns.
 *
 *   success: { "data": ..., "meta": { ... } }
 *   failure: { "error": { "code", "message", "fields"?, "details"? } }
 *
 * Clients can therefore branch on the presence of `error` alone, and no route
 * is free to invent its own shape.
 */
import { NextResponse } from 'next/server';
import { AppError, isAppError, type ErrorCode, type FieldErrors } from './errors';
import { isProduction } from '@/lib/config/env';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown> & Partial<PageMeta>;
}

export interface ApiFailure {
  error: {
    code: ErrorCode;
    message: string;
    fields?: FieldErrors;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export function ok<T>(data: T, init?: { status?: number; meta?: ApiSuccess<T>['meta']; headers?: HeadersInit }) {
  const body: ApiSuccess<T> = init?.meta ? { data, meta: init.meta } : { data };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
}

export const created = <T>(data: T, meta?: ApiSuccess<T>['meta']) => ok(data, { status: 201, meta });

export const noContent = () => new NextResponse(null, { status: 204 });

export function paginated<T>(items: T[], page: number, pageSize: number, total: number) {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return ok(items, {
    meta: { page, pageSize, total, totalPages, hasMore: page < totalPages },
  });
}

/**
 * Render an error. Unknown throwables become a generic 500: their message is
 * logged server-side but never returned, because it may contain SQL, file
 * paths or credentials.
 */
export function fail(err: unknown, requestId?: string): NextResponse<ApiFailure> {
  const appErr: AppError = isAppError(err)
    ? err
    : new AppError('INTERNAL_ERROR', 'Something went wrong on our side.', { cause: err });

  if (appErr.status >= 500) {
    console.error('[api:error]', requestId ?? '-', appErr.code, appErr.message, appErr.cause ?? '');
  }

  const body: ApiFailure = {
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.fields ? { fields: appErr.fields } : {}),
      ...(appErr.details ? { details: appErr.details } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };

  // Outside production, surface the underlying cause to speed up debugging.
  if (!isProduction() && appErr.status >= 500 && appErr.cause instanceof Error) {
    body.error.details = { ...(body.error.details ?? {}), cause: appErr.cause.message };
  }

  const headers = new Headers();
  if (appErr.retryAfter !== undefined) headers.set('Retry-After', String(appErr.retryAfter));

  return NextResponse.json(body, { status: appErr.status, headers });
}
