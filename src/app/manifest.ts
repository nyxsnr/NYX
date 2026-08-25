import type { MetadataRoute } from 'next';

/**
 * PWA manifest.
 *
 * The brief calls for a responsive PWA rather than a native app, so the web
 * app is installable on Android from day one and can be wrapped later.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KaziOS — Turn Your Skills Into Income',
    short_name: 'KaziOS',
    description: 'Discover what you can do, prove your skills and find real work.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0a7a63',
    orientation: 'portrait-primary',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
