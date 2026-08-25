'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './icons';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/**
 * Is this nav item the one the current page belongs to?
 *
 * Section roots (`/worker`) must match exactly or they would light up on every
 * page beneath them; deeper items match their whole subtree so that
 * `/worker/jobs/42` still shows "Jobs" as current.
 */
function isCurrent(pathname: string, href: string, allHrefs: string[]): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // A longer item also matching this path is the more specific answer.
  return !allHrefs.some((other) => other !== href && other.length > href.length && (pathname === other || pathname.startsWith(`${other}/`)));
}

/** Sidebar navigation (large screens). */
export function SidebarNav({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname() ?? '';
  const hrefs = nav.map((n) => n.href);

  return (
    <nav className="flex-1 space-y-0.5 p-3" aria-label="Main">
      {nav.map((item) => {
        const current = isCurrent(pathname, item.href, hrefs);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`nav-link relative ${
              current
                ? 'bg-jade-50 font-semibold text-jade-800 dark:bg-jade-950 dark:text-jade-200'
                : ''
            }`}
          >
            {current ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-jade-600 dark:bg-jade-400"
              />
            ) : null}
            <Icon name={item.icon} size={19} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Bottom navigation (small screens).
 *
 * Five items maximum, in thumb reach, with the current one marked by colour
 * and a bar above it — colour alone would be the only cue for someone who
 * cannot distinguish it.
 */
export function BottomNav({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname() ?? '';
  const items = nav.slice(0, 5);
  const hrefs = nav.map((n) => n.href);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid border-t lg:hidden"
      style={{
        background: 'color-mix(in srgb, var(--surface) 97%, transparent)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, minmax(0, 1fr))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Main"
    >
      {items.map((item) => {
        const current = isCurrent(pathname, item.href, hrefs);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[0.6875rem] font-medium transition-colors ${
              current ? 'text-jade-700 dark:text-jade-300' : 'text-secondary'
            }`}
          >
            {current ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-jade-600 dark:bg-jade-400"
              />
            ) : null}
            <Icon name={item.icon} size={21} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
