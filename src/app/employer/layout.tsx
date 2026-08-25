import { requireAuth } from '@/lib/auth/guards';
import { AppShell, type NavItem } from '@/components/app-shell';
import { unreadCount } from '@/lib/notifications';

const NAV: NavItem[] = [
  { href: '/employer', label: 'Home', icon: 'home' },
  { href: '/employer/jobs', label: 'Jobs', icon: 'briefcase' },
  { href: '/employer/tasks', label: 'Tasks', icon: 'bolt' },
  { href: '/employer/talent', label: 'Talent', icon: 'search' },
  { href: '/employer/billing', label: 'Billing', icon: 'wallet' },
  { href: '/employer/projects', label: 'Projects', icon: 'folder' },
  { href: '/employer/company', label: 'Company', icon: 'building' },
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
