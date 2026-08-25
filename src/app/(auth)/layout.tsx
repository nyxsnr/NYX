import { Wordmark } from '@/components/wordmark';
import { Mesh } from '@/components/marketing/mesh';

/**
 * Sign-in and sign-up layout.
 *
 * Stays on the cinematic ground: the moment someone commits is the worst
 * possible place to drop them onto a plain white utility screen that looks
 * like a different product from the one they just scrolled through.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cinema grain relative flex min-h-dvh flex-col overflow-hidden">
      <Mesh variant="close" />
      <div aria-hidden="true" className="vignette pointer-events-none absolute inset-0" />

      <header className="relative z-[2]">
        <div className="container-page flex max-w-6xl items-center justify-between py-5">
          <Wordmark href="/" />
        </div>
      </header>

      <main
        id="main"
        className="relative z-[2] flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-14"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
