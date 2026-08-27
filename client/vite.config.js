import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png'],
      manifest: {
        // Guests reach /enroll and / under this manifest, so it must not carry a
        // chain name or a chain logo. The parking pages swap in their own at
        // runtime (utils/whitelabel).
        name: 'MSY Parking & Rewards',
        short_name: 'Parking',
        description: 'Pay for parking or join the rewards program.',
        theme_color: '#0F1B2D',
        background_color: '#FBF8F3',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/parking-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/parking-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/parking-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Anything with a file extension is a real file, not an SPA route.
        // Without this the worker answers a *typed* /sign.png with index.html,
        // so the direct image link submitted as Twilio opt-in proof would show
        // the app shell to anyone who has the worker installed. No client route
        // contains a dot, so this can't shadow one.
        navigateFallbackDenylist: [/^\/api/, /\.[^/]+$/],
        // Precache the guest shell only. A guest paying for parking should not
        // have to download the staff app (queue, leaderboard, QR generator and
        // its qrcode library) before their form is usable — and those chunks
        // hold no value on a phone that will never sign in. Staff routes are
        // fetched on demand and then served by the static-assets rule below.
        globPatterns: [
          '**/index.html',
          '**/assets/index-*.{js,css}',
          '**/assets/{Park,ParkStatus,Enroll,DurationPicker,ParkingStatusPill,AddressFields,format,whitelabel}-*.js',
          'favicon.png',
          'icons/parking-*.png',
        ],
        runtimeCaching: [
          {
            // Auth must never be served from cache. A cached 200 for
            // /api/auth/me can sign the NEXT person on a shared front-desk
            // tablet back in as the PREVIOUS user, with their role, once the
            // network is slow enough to hit networkTimeoutSeconds.
            // First match wins, so this must precede the generic /api rule.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/auth'),
            handler: 'NetworkOnly',
          },
          {
            // Payment/status endpoints must never serve from cache — a stale
            // "active" reading on the guest page is unacceptable.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/parking'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              networkTimeoutSeconds: 10,
              // These responses carry guest PII. Bound how long a copy can sit
              // on a shared device; signing out also purges the cache outright
              // (see clearApiCache in stores/auth.js).
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            // Same-origin only: a cross-origin stylesheet (Google Fonts) comes
            // back opaque, and CacheFirst cannot tell an opaque failure from a
            // success — it would cache the failure permanently.
            urlPattern: ({ url, request }) =>
              url.origin === self.location.origin &&
              ['style', 'script', 'image', 'font'].includes(request.destination),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      // Keep the service worker out of `vite dev` to avoid stale-cache surprises.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to Express in dev so the auth cookie stays first-party.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
