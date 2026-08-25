import type { NextConfig } from 'next';

/**
 * `next dev` sets NODE_ENV=development; `next build` and `next start` set it to
 * 'production'. This file is evaluated by the Next.js server at startup, so the
 * flag reflects how the server was actually launched — a production build can
 * never emit the development policy below.
 */
const isDev = process.env.NODE_ENV === 'development';

/**
 * Content-Security-Policy.
 *
 * KaziOS renders untrusted, user-authored content (proposals, job descriptions,
 * portfolio copy) and must not become an XSS vector, so the production policy is
 * deliberately strict and MUST NOT gain 'unsafe-eval'.
 *
 * The development build additionally needs:
 *
 *   'unsafe-eval'  React's development build and Turbopack's HMR runtime
 *                  evaluate modules through eval() so that stack traces and
 *                  breakpoints map back to original source. Without it the
 *                  browser refuses to boot the app at all.
 *   ws:            Hot reload opens a WebSocket back to the dev server.
 *
 * Both are gated on `isDev` and are therefore absent from `next build` output.
 * Verify with:  curl -sI http://localhost:3000/ | grep -i content-security
 */
function contentSecurityPolicy(): string {
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  const connectSrc = ["'self'", 'https:'];

  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push('ws:');
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/** Security headers applied to every response. */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Worker devices are often low-end Android phones on slow links; keep payloads small.
  compress: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [320, 420, 640, 768, 1024, 1280],
  },
  serverExternalPackages: ['postgres'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
