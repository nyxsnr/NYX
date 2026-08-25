import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from './sign-out-button';
import { NotificationBell } from './notification-bell';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

/**
 * The signed-in application shell.
 *
 * Mobile-first: navigation is a bottom bar on small screens (thumb reach) and
 * a sidebar from `lg` up. The same items drive both, so there is one source of
 * truth for where a person can go.
 */
export function AppShell({
  children,
  nav,
  user,
  unread,
  accent = 'jade',
}: {
  children: ReactNode;
  nav: NavItem[];
  user: { fullName: string; role: string; isDemo: boolean };
  unread: number;
  accent?: 'jade' | 'ochre';
}) {
  const accentBg = accent === 'ochre' ? 'bg-ochre-500 text-ink-950' : 'bg-jade-600 text-white';

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Sidebar (large screens) */}
      <aside className="hidden w-60 shrink-0 border-r lg:flex lg:flex-col">
        <div className="border-b px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${accentBg}`}>
              K
            </span>
            KaziOS
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="tap flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-secondary hover:surface-sunken hover:text-jade-700 dark:hover:text-jade-300"
            >
              <span aria-hidden="true" className="w-5 text-center">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t p-3">
          <p className="truncate px-3 text-sm font-semibold">{user.fullName}</p>
          <p className="px-3 text-xs text-muted">{user.role.toLowerCase()}</p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (small screens) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 lg:hidden" style={{ background: 'var(--surface)' }}>
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs ${accentBg}`}>
              K
            </span>
            KaziOS
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell unread={unread} />
            <SignOutButton compact />
          </div>
        </header>

        {user.isDemo ? (
          <div className="border-b bg-ochre-100 px-4 py-2 text-center text-xs font-semibold text-ochre-900 dark:bg-ochre-900/40 dark:text-ochre-100">
            You are signed in to a demo account. This data is for demonstration only.
          </div>
        ) : null}

        <main id="main" className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>

        {/* Bottom navigation (small screens) */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid border-t lg:hidden"
          style={{ background: 'var(--surface)', gridTemplateColumns: `repeat(${Math.min(nav.length, 5)}, minmax(0, 1fr))` }}
          aria-label="Main"
        >
          {nav.slice(0, 5).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-1 py-2 text-[0.6875rem] font-medium text-secondary"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
