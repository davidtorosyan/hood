// Service-worker registration with aggressive update checks, so a fresh deploy
// reaches players (and Dave's phone) the next time the app comes to the
// foreground — not "eventually". vite-plugin-pwa's autoUpdate mode reloads the
// page once the new worker takes control; the game restores its saved spot.
import { registerSW } from 'virtual:pwa-register';

const CHECK_EVERY_MS = 5 * 60 * 1000;

export function initPwa() {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, reg) {
      if (!reg) return;
      // The very first visit's page load happens before the worker is in
      // control, so the network-first page cache is empty; warm it now so an
      // offline launch right after install still has the app shell.
      window.caches?.open('hood-pages').then((c) => c.add(location.pathname)).catch(() => {});
      const check = () => {
        // Skip while offline (the check would just fail) or mid-install.
        if (!navigator.onLine || reg.installing) return;
        reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
      setInterval(check, CHECK_EVERY_MS);
    },
  });
}
