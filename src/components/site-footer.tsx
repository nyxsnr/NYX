import Link from 'next/link';

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: 'Workers',
    links: [
      { label: 'Find work', href: '/signup?role=worker' },
      { label: 'Browse jobs', href: '/jobs' },
      { label: 'Browse tasks', href: '/tasks' },
      { label: 'How it works', href: '/#how-it-works' },
    ],
  },
  {
    title: 'Employers',
    links: [
      { label: 'Hire talent', href: '/signup?role=employer' },
      { label: 'For employers', href: '/#for-employers' },
      { label: 'Trust & verification', href: '/#trust' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'Proof of work', href: '/#proof' },
      { label: 'AI capabilities', href: '/#ai' },
      { label: 'Questions', href: '/#faq' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t surface-sunken">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-bold">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-jade-600 text-sm text-white"
              >
                K
              </span>
              KaziOS
            </div>
            <p className="mt-3 max-w-xs text-sm text-secondary">
              AI-powered employment infrastructure. Built in Kenya, for Kenya.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold">{column.title}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} className="text-secondary hover:text-jade-600 dark:hover:text-jade-300">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t pt-6 text-xs text-muted">
          <p>
            KaziOS does not guarantee employment or income. Any earnings figures shown are indicative
            ranges for the Kenyan market, not offers.
          </p>
          <p className="mt-2">
            © {new Date().getFullYear()} KaziOS. Nairobi, Kenya.
          </p>
        </div>
      </div>
    </footer>
  );
}
