import Link from 'next/link';
import { Wordmark } from './wordmark';

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

/**
 * Site footer.
 *
 * Inherits the surrounding surface rather than painting its own: on the
 * marketing pages that is the cinematic ground, so the page fades out into
 * the same dark it opened on instead of hitting a second, competing band.
 */
export function SiteFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)' }}>
      <div className="container-page max-w-7xl py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-sm text-secondary">
              AI-powered employment infrastructure. Built in Kenya, for Kenya.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold">{column.title}</h2>
              <ul className="mt-4 space-y-3 text-sm">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} className="link-underline text-secondary hover:text-jade-300">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t pt-6 text-xs text-muted">
          <p className="max-w-3xl">
            KaziOS does not guarantee employment or income. Any earnings figures shown are indicative
            ranges for the Kenyan market, not offers.
          </p>
          <p className="mt-3">© {new Date().getFullYear()} KaziOS. Nairobi, Kenya.</p>
        </div>
      </div>
    </footer>
  );
}
