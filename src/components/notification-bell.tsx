import Link from 'next/link';

export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link href="/notifications" className="btn btn-ghost relative px-3" aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}>
      <span aria-hidden="true">🔔</span>
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ochre-500 px-1 text-[0.625rem] font-bold text-ink-950">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
