import './style.css';
import { el, clear } from './ui/dom.js';
import { mountJigsaw } from './jigsaw/index.js';
import { NODES } from './jigsaw/tree.js';
import { store } from './store.js';
import { initTelemetry } from './telemetry.js';
import { openBugReport } from './bugreport.js';

initTelemetry();

// In dev, kill any stale PWA service worker + caches. The dev server's port can
// cycle (5173/5175/…) and come back; a service worker registered for this
// host:port in an earlier session then intercepts `/hood/` and serves stale
// assets — which shows up as only being able to load weird paths like
// `/hood/hood`. We never want a SW during local dev. (Production keeps its PWA.)
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
}

const app = document.querySelector('#app');

// Leaving the jigsaw for home also forgets the saved spot, so the next launch
// opens on home (until they play again).
function goHome() {
  store.clearNav();
  renderHome();
}

function renderHome() {
  clear(app);
  app.append(
    el('div', { class: 'screen home' }, [
      el('div', { class: 'home-top' }, [
        el('h1', { class: 'home-title' }, 'Hood'),
        el('p', { class: 'home-tag' }, 'Get to know Los Angeles County — piece by piece.'),
      ]),
      el('div', { class: 'home-art' }, '🧩'),
      el('button', { class: 'btn home-play', onClick: () => mountJigsaw(app, { back: goHome }) }, 'Play'),
      el('p', { class: 'home-note' }, 'Drag the pieces together, then tap one to zoom in.'),
      el('button', { class: 'home-report', onClick: openBugReport }, 'Report a bug'),
    ]),
  );
}

// Resume the last spot (node + in-progress puzzle) if we have a valid one — so a
// reload / PWA restart drops you back in instead of on home.
const nav = store.nav();
if (nav && NODES[nav.node]) {
  mountJigsaw(app, { back: goHome, resume: nav });
} else {
  if (nav) store.clearNav(); // stale (data changed under it)
  renderHome();
}
