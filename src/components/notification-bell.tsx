import Link from 'next/link';
import { Icon } from './icons';

/**
 * Notification bell with an unread count.
 *
 * The count is part of the link's accessible name rather than a bare number
 * floating in the corner, so it is announced as "Notifications, 3 unread"
 * instead of "Notifications 3".
 */
export function NotificationBell({ unread, className = '' }: { unread: number; className?: string }) {
  return (
    <Link
      href="/notifications"
      className={`btn btn-ghost relative px-3 ${className}`}
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
    >
      <Icon name="bell" size={20} />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 flex min-w-[1.125rem] items-center justify-center rounded-full bg-ochre-500 px-1 py-px text-[0.625rem] font-bold text-ink-950"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
