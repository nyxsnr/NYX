import { requireAuth } from '@/lib/auth/guards';
import { AppShell, type NavItem } from '@/components/app-shell';
import { unreadCount } from '@/lib/notifications';

const NAV: NavItem[] = [
  { href: '/worker', label: 'Home', icon: '◆' },
  { href: '/worker/jobs', label: 'Jobs', icon: '💼' },
  { href: '/worker/tasks', label: 'Tasks', icon: '⚡' },
  { href: '/worker/simulations', label: 'Prove', icon: '✓' },
  { href: '/worker/earnings', label: 'Earnings', icon: '₭' },
  { href: '/worker/applications', label: 'Applications', icon: '📄' },
  { href: '/worker/profile', label: 'Profile', icon: '👤' },
  { href: '/worker/portfolio', label: 'Portfolio', icon: '🗂' },
  { href: '/worker/interview', label: 'Interview practice', icon: '🎙' },
  { href: '/worker/agent', label: 'Career agent', icon: '✳' },
];

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth(['WORKER'], '/worker');
  const unread = await unreadCount(auth.user.id);

  return (
    <AppShell nav={NAV} user={{ fullName: auth.user.fullName, role: auth.user.role, isDemo: auth.user.isDemo }} unread={unread}>
      {children}
    </AppShell>
  );
}
