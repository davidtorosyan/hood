import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// For GitHub Pages project sites the app is served from /<repo>/.
// Override at build time with BASE_PATH if the repo name differs.
const base = process.env.BASE_PATH ?? '/hood/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Hood — Learn LA Neighborhoods',
        short_name: 'Hood',
        description: 'A game for learning the neighborhoods of Los Angeles.',
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
