import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// For GitHub Pages project sites the app is served from /<repo>/.
// Override at build time with BASE_PATH if the repo name differs.
const base = process.env.BASE_PATH ?? '/hood/';

// Short commit, baked in so bug reports say exactly which build they hit.
let commit = 'dev';
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  /* not a git checkout (or git missing) — fine */
}

export default defineConfig({
  base,
  define: {
    __COMMIT__: JSON.stringify(commit),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    VitePWA({
      // Updates must reach players right away (Dave tests on his phone straight
      // after a push). The new service worker activates immediately
      // (skipWaiting + clientsClaim) and src/pwa.js reloads the page once it takes
      // control. Saved game state restores across that reload.
      registerType: 'autoUpdate',
      injectRegister: false, // registered by src/pwa.js (update checks on focus)
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Never serve a precached (possibly stale) index.html: page navigations
        // go to the network first and use the cached copy only when offline or
        // slow. Hashed JS/CSS assets stay precached (their names change per build).
        globPatterns: ['**/*.{js,css,png,svg,ico,webmanifest}'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'hood-pages', networkTimeoutSeconds: 4 },
          },
        ],
      },
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Hood — Learn LA Neighborhoods',
        short_name: 'Hood',
        description: 'A zoomable jigsaw map for learning the neighborhoods of Los Angeles.',
        theme_color: '#f4f6fb',
        background_color: '#f4f6fb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
