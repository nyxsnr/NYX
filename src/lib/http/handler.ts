/**
 * Route handler factory.
 *
 * Every API route is declared through `route()`, which applies — in order —
 * origin/CSRF checks, rate limiting, authentication, authorization, and
 * schema validation before the handler body runs. Doing it here rather than
 * per-route means a new endpoint cannot accidentally ship without them.
 *
 * Client-supplied authorization is never trusted: role and permission come
 * from the session row, re-read from the database on every request.
 */
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z, type ZodTypeAny } from 'zod';
import { fail, ok } from './response';
import {
  AppError,
  badRequest,
  forbidden,
  unauthenticated,
  validationFailed,
  type FieldErrors,
} from './errors';
import { clientIp, enforceRateLimit, type RateLimitName } from './rate-limit';
import { CSRF_HEADER, deriveCsrfToken, getAuthContext, parseSessionCookie, SESSION_COOKIE, type AuthContext } from '@/lib/auth/session';
import { hasPermission, type Permission, type UserRole } from '@/lib/auth/rbac';
import { getEnv } from '@/lib/config/env';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY_BYTES = 1_000_000; // 1 MB; file uploads use their own route.

export interface RouteContext<TBody, TQuery, TParams> {
  request: NextRequest;
  body: TBody;
  query: TQuery;
  params: TParams;
  /** Present whenever `auth: 'required'`. */
  auth: AuthContext;
  /** Null for public routes with no session. */
  maybeAuth: AuthContext | null;
  ip: string;
  requestId: string;
}

export interface RouteConfig<TBody extends ZodTypeAny, TQuery extends ZodTypeAny, TParams extends ZodTypeAny> {
  auth?: 'public' | 'optional' | 'required';
  roles?: UserRole[];
  permission?: Permission;
  body?: TBody;
  query?: TQuery;
  params?: TParams;
  rateLimit?: { name: RateLimitName; by?: 'ip' | 'user' };
  /** Defaults to true for mutating methods. Only disable for provider webhooks. */
  csrf?: boolean;
  /** Require a verified email address (used before applying or posting work). */
  requireVerifiedEmail?: boolean;
}

type Infer<T> = T extends ZodTypeAny ? z.infer<T> : undefined;

function zodToFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/**
 * CSRF: same-origin check plus double-submit token.
 *
 * SameSite=Lax already blocks the classic cross-site form POST; these two
 * layers cover the cases it does not (older browsers, and same-site
 * subdomain takeover).
 */
async function assertCsrf(request: NextRequest): Promise<void> {
  const origin = request.headers.get('origin');
  if (origin) {
    const appUrl = getEnv().APP_URL;
    let allowed: boolean;
    try {
      allowed = new URL(origin).origin === new URL(appUrl).origin;
    } catch {
      allowed = false;
    }
    if (!allowed) throw forbidden('Cross-origin request rejected.');
  }

  const sessionToken = parseSessionCookie(request.cookies.get(SESSION_COOKIE)?.value);
  // No session means nothing to protect: sign-in and sign-up are guarded by
  // the origin check and rate limits instead.
  if (!sessionToken) return;

  const supplied = request.headers.get(CSRF_HEADER);
  if (!supplied || supplied !== deriveCsrfToken(sessionToken)) {
    throw forbidden('Missing or invalid CSRF token.');
  }
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Expected Content-Type: application/json.');
  }

  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw badRequest('Request body is not valid JSON.');
  }
}

function queryToObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    out[key] = values.length > 1 ? values : (values[0] as string);
  }
  return out;
}

export function route<
  TBody extends ZodTypeAny = never,
  TQuery extends ZodTypeAny = never,
  TParams extends ZodTypeAny = never,
>(
  config: RouteConfig<TBody, TQuery, TParams>,
  handler: (ctx: RouteContext<Infer<TBody>, Infer<TQuery>, Infer<TParams>>) => Promise<NextResponse> | NextResponse,
) {
  return async (
    request: NextRequest,
    routeArgs?: { params?: Promise<Record<string, string | string[]>> },
  ): Promise<NextResponse> => {
    const requestId = randomUUID();

    try {
      const method = request.method.toUpperCase();
      const needsCsrf = config.csrf ?? MUTATING.has(method);
      if (needsCsrf) await assertCsrf(request);

      // --- Authentication -------------------------------------------------
      const mode = config.auth ?? 'public';
      let auth: AuthContext | null = null;
      if (mode !== 'public') {
        auth = await getAuthContext();
        if (!auth && mode === 'required') throw unauthenticated();
      }

      // --- Rate limiting --------------------------------------------------
      const ip = clientIp(request);
      if (config.rateLimit) {
        const by = config.rateLimit.by ?? 'ip';
        const identifier = by === 'user' && auth ? auth.user.id : ip;
        await enforceRateLimit(config.rateLimit.name, identifier);
      }

      // --- Authorization --------------------------------------------------
      if (auth) {
        if (config.roles && !config.roles.includes(auth.user.role)) {
          throw forbidden('Your account type cannot access this resource.');
        }
        if (config.permission && !hasPermission(auth.user.role, config.permission)) {
          throw forbidden('You do not have permission to do that.');
        }
        if (config.requireVerifiedEmail && !auth.user.emailVerifiedAt) {
          throw new AppError('PRECONDITION_FAILED', 'Verify your email address to continue.', {
            details: { requires: 'email_verification' },
          });
        }
      }

      // --- Validation -----------------------------------------------------
      let body: unknown;
      if (config.body) {
        const raw = MUTATING.has(method) ? await readJsonBody(request) : {};
        const parsed = config.body.safeParse(raw);
        if (!parsed.success) throw validationFailed(zodToFieldErrors(parsed.error));
        body = parsed.data;
      }

      let query: unknown;
      if (config.query) {
        const parsed = config.query.safeParse(queryToObject(new URL(request.url)));
        if (!parsed.success) throw validationFailed(zodToFieldErrors(parsed.error));
        query = parsed.data;
      }

      let params: unknown;
      if (config.params) {
        const raw = (await routeArgs?.params) ?? {};
        const parsed = config.params.safeParse(raw);
        if (!parsed.success) throw validationFailed(zodToFieldErrors(parsed.error));
        params = parsed.data;
      }

      const response = await handler({
        request,
        body: body as Infer<TBody>,
        query: query as Infer<TQuery>,
        params: params as Infer<TParams>,
        // Safe: `mode === 'required'` guarantees auth is non-null by here.
        auth: auth as AuthContext,
        maybeAuth: auth,
        ip,
        requestId,
      });

      response.headers.set('x-request-id', requestId);
      return response;
    } catch (err) {
      return fail(err, requestId);
    }
  };
}

/** Convenience for endpoints that only need to echo a computed value. */
export const respond = ok;

/** 405 handler for methods a route does not implement. */
export function methodNotAllowed(allowed: string[]) {
  return () =>
    NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: `Method not allowed. Allowed: ${allowed.join(', ')}.` } },
      { status: 405, headers: { Allow: allowed.join(', ') } },
    );
}
