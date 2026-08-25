import { Wordmark } from '@/components/wordmark';

/**
 * Sign-in and sign-up layout.
 *
 * The form sits on the ambient hero wash rather than a flat white page, so the
 * first authenticated step looks like part of the product a visitor just
 * scrolled through instead of a bare utility screen.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div aria-hidden="true" className="hero-wash pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="grid-lines pointer-events-none absolute inset-0 opacity-50" />

      <header className="relative">
        <div className="container-page flex max-w-6xl items-center justify-between py-4">
          <Wordmark href="/" />
        </div>
      </header>

      <main
        id="main"
        className="relative flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-16"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
