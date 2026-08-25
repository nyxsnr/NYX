import Link from 'next/link';
import { getAuthContext } from '@/lib/auth/session';
import { homePathFor } from '@/lib/auth/rbac';
import { Icon } from './icons';
import { Wordmark } from './wordmark';

/**
 * Public site header.
 *
 * Reads the session so a signed-in visitor landing on the marketing page is
 * offered their dashboard rather than being asked to sign in again.
 *
 * The bar is translucent over the hero wash rather than opaque, so the page
 * feels like one surface scrolling under a sheet of glass. Where
 * backdrop-filter is unsupported the colour-mix background is still opaque
 * enough to keep the links legible.
 */
export async function SiteHeader() {
  const auth = await getAuthContext().catch(() => null);

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
        backdropFilter: 'blur(14px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.6)',
      }}
    >
      <div className="container-page flex max-w-7xl items-center justify-between gap-4 py-3">
        <Wordmark href="/" />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          <Link href="/jobs" className="btn btn-ghost">
            Browse jobs
          </Link>
          <Link href="/tasks" className="btn btn-ghost">
            Browse tasks
          </Link>
          <Link href="/#how-it-works" className="btn btn-ghost">
            How it works
          </Link>
          <Link href="/#proof" className="btn btn-ghost">
            Proof of work
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {auth ? (
            <Link href={homePathFor(auth.user.role)} className="btn btn-primary btn-pill">
              Dashboard
              <Icon name="arrow-right" size={16} />
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
                Sign in
              </Link>
              <Link href="/signup?role=worker" className="btn btn-primary btn-pill">
                Find work
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
