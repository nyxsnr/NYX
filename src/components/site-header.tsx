import Link from 'next/link';
import { getAuthContext } from '@/lib/auth/session';
import { homePathFor } from '@/lib/auth/rbac';

/**
 * Public site header.
 *
 * Reads the session so a signed-in visitor landing on the marketing page is
 * offered their dashboard rather than being asked to sign in again.
 */
export async function SiteHeader() {
  const auth = await getAuthContext().catch(() => null);

  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)' }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-jade-600 text-sm font-bold text-white"
          >
            K
          </span>
          <span className="text-lg">KaziOS</span>
        </Link>

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
        </nav>

        <div className="flex items-center gap-2">
          {auth ? (
            <Link href={homePathFor(auth.user.role)} className="btn btn-primary">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Sign in
              </Link>
              <Link href="/signup?role=worker" className="btn btn-primary">
                Find Work
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
