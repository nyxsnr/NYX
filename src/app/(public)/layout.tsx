import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

/**
 * Public browsing layout (jobs, tasks and their detail pages).
 *
 * Shares the cinematic ground with the landing page so that following a link
 * from the marketing site into a job listing does not feel like leaving for a
 * different product.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cinema grain relative flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="relative z-[2] flex-1 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
