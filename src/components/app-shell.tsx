import type { ReactNode } from 'react';
import { SignOutButton } from './sign-out-button';
import { NotificationBell } from './notification-bell';
import { SidebarNav, BottomNav, type NavItem } from './app-nav';
import { Wordmark } from './wordmark';

export type { NavItem };

/**
 * The signed-in application shell.
 *
 * Mobile-first: navigation is a bottom bar on small screens (thumb reach) and
 * a sidebar from `lg` up. The same items drive both, so there is one source of
 * truth for where a person can go, and both mark the current section — without
 * that, every page in the product looked identical to the one before it.
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
  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Sidebar (large screens) */}
      <aside
        className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r lg:flex"
        style={{ background: 'var(--surface-sunken)' }}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Wordmark href="/" accent={accent} />
          {/* The bell used to exist only in the small-screen header, which left
              a signed-in desktop user with no route to their notifications. */}
          <NotificationBell unread={unread} />
        </div>

        <SidebarNav nav={nav} />

        <div className="border-t p-3">
          <div className="flex items-center gap-3 px-1 py-2">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-jade-100 text-sm font-bold text-jade-800 dark:bg-jade-900 dark:text-jade-200"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.fullName}</p>
              <p className="text-xs capitalize text-muted">{user.role.toLowerCase()}</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (small screens) */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between border-b px-4 py-2.5 lg:hidden"
          style={{
            background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
        >
          <Wordmark href="/" size="sm" accent={accent} />
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

        <main id="main" className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>

        <BottomNav nav={nav} />
      </div>
    </div>
  );
}
