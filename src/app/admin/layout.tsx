import { requireAuth } from '@/lib/auth/guards';
import { AppShell, type NavItem } from '@/components/app-shell';
import { unreadCount } from '@/lib/notifications';

const NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: '◆' },
  { href: '/admin/moderation', label: 'Moderation', icon: '🛡' },
  { href: '/admin/disputes', label: 'Disputes', icon: '⚖' },
  { href: '/admin/fraud', label: 'Fraud', icon: '⚠' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/verifications', label: 'Verifications', icon: '✓' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth(['ADMIN'], '/admin');
  const unread = await unreadCount(auth.user.id);

  return (
    <AppShell nav={NAV} user={{ fullName: auth.user.fullName, role: auth.user.role, isDemo: auth.user.isDemo }} unread={unread}>
      {children}
    </AppShell>
  );
}
