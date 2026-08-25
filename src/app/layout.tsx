import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

/**
 * Typefaces.
 *
 * `globals.css` named Inter as the body face but nothing ever loaded it, so
 * the whole product had been rendering in whatever system-ui resolved to.
 *
 * Space Grotesk carries the display sizes: at 4rem and up its tight apertures
 * and squared terminals give headlines a technical edge that Inter, which is
 * built to disappear, deliberately does not have. Both are self-hosted by
 * next/font at build time — no request to Google at runtime, and no layout
 * shift while a webfont swaps in.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-display-face',
});

export const metadata: Metadata = {
  title: {
    default: 'KaziOS — Turn Your Skills Into Income',
    template: '%s · KaziOS',
  },
  description:
    'KaziOS helps you discover what you can do, prove your skills and connect with real work in Kenya.',
  applicationName: 'KaziOS',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'KaziOS', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'KaziOS — Turn Your Skills Into Income',
    description:
      'Discover what you can do, prove it with real work simulations, and connect with employers who need it.',
    type: 'website',
    locale: 'en_KE',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is never disabled: pinch-to-zoom is an accessibility necessity.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#10151a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-jade-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
