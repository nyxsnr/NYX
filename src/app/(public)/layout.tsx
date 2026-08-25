import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
