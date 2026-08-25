/**
 * Browser API client.
 *
 * One place that knows the response envelope, attaches the CSRF header on
 * mutations, and turns a failure into a typed error carrying per-field
 * messages. Components therefore never parse an error shape by hand, and no
 * screen can accidentally skip CSRF.
 */
import type { ErrorCode, FieldErrors } from '@/lib/http/errors';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: FieldErrors;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: ErrorCode, message: string, fields: FieldErrors = {}, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }

  /** First message for a field, for rendering next to an input. */
  fieldError(name: string): string | undefined {
    return this.fields[name]?.[0];
  }
}

const CSRF_COOKIE = 'kazios_csrf';
const CSRF_HEADER = 'x-kazios-csrf';

function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Multipart uploads set their own Content-Type boundary. */
  formData?: FormData;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  if (method !== 'GET') {
    const token = readCsrfToken();
    if (token) headers[CSRF_HEADER] = token;
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch (err) {
    // A network failure on a mobile connection is the common case, not the
    // exception. Say so plainly instead of surfacing "TypeError: fetch failed".
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'INTERNAL_ERROR', 'Could not reach KaziOS. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(response.status, 'INTERNAL_ERROR', 'The server returned an unexpected response.');
    }
  }

  if (!response.ok) {
    const body = payload as { error?: { code?: ErrorCode; message?: string; fields?: FieldErrors; details?: Record<string, unknown> } } | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? 'Something went wrong. Please try again.',
      body?.error?.fields ?? {},
      body?.error?.details,
    );
  }

  return (payload as { data: T }).data;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData }),
};

/** Build a query string, skipping empty values. */
export function queryString(params: Record<string, string | number | boolean | undefined | null | string[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
