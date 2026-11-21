import type { MetadataRoute } from 'next';

/**
 * PWA manifest (PLAN §7.13: installable; keeps working across flaky Wi-Fi by reconnecting with a
 * snapshot). Colours are literal because the manifest can't read CSS tokens; they match the
 * root layout's `themeColor` and the `background` token.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MPL · Mini Militia Premier League',
    short_name: 'MPL',
    description: 'Live player auction, squads, groups and knockout for Mini Militia tournaments.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#12160e',
    theme_color: '#12160e',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
