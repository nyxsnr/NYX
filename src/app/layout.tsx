import type { Metadata, Viewport } from 'next';
import './globals.css';

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
    <html lang="en" data-scroll-behavior="smooth">
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
