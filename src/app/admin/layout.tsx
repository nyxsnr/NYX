import { requireAuth } from '@/lib/auth/guards';
import { AppShell, type NavItem } from '@/components/app-shell';
import { unreadCount } from '@/lib/notifications';

const NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: 'home' },
  { href: '/admin/moderation', label: 'Moderation', icon: 'shield' },
  { href: '/admin/disputes', label: 'Disputes', icon: 'scales' },
  { href: '/admin/fraud', label: 'Fraud', icon: 'warning' },
  { href: '/admin/users', label: 'Users', icon: 'users' },
  { href: '/admin/verifications', label: 'Verifications', icon: 'badge-check' },
  { href: '/admin/analytics', label: 'Analytics', icon: 'chart' },
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
