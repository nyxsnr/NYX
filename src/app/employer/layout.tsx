import { requireAuth } from '@/lib/auth/guards';
import { AppShell, type NavItem } from '@/components/app-shell';
import { unreadCount } from '@/lib/notifications';

const NAV: NavItem[] = [
  { href: '/employer', label: 'Home', icon: '◆' },
  { href: '/employer/jobs', label: 'Jobs', icon: '💼' },
  { href: '/employer/tasks', label: 'Tasks', icon: '⚡' },
  { href: '/employer/talent', label: 'Talent', icon: '🔍' },
  { href: '/employer/billing', label: 'Billing', icon: '₭' },
  { href: '/employer/projects', label: 'Projects', icon: '🗂' },
  { href: '/employer/company', label: 'Company', icon: '🏢' },
];

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAuth(['EMPLOYER'], '/employer');
  const unread = await unreadCount(auth.user.id);

  return (
    <AppShell
      nav={NAV}
      user={{ fullName: auth.user.fullName, role: auth.user.role, isDemo: auth.user.isDemo }}
      unread={unread}
      accent="ochre"
    >
      {children}
    </AppShell>
  );
}
