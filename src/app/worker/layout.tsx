import { requireAuth } from '@/lib/auth/guards';
import { AppShell, type NavItem } from '@/components/app-shell';
import { unreadCount } from '@/lib/notifications';

const NAV: NavItem[] = [
  { href: '/worker', label: 'Home', icon: 'home' },
  { href: '/worker/jobs', label: 'Jobs', icon: 'briefcase' },
  { href: '/worker/tasks', label: 'Tasks', icon: 'bolt' },
  { href: '/worker/simulations', label: 'Prove', icon: 'badge-check' },
  { href: '/worker/earnings', label: 'Earnings', icon: 'wallet' },
  { href: '/worker/applications', label: 'Applications', icon: 'document' },
  { href: '/worker/profile', label: 'Profile', icon: 'user' },
  { href: '/worker/portfolio', label: 'Portfolio', icon: 'folder' },
  { href: '/worker/interview', label: 'Interview practice', icon: 'mic' },
  { href: '/worker/agent', label: 'Career agent', icon: 'chat' },
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
