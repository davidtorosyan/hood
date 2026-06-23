import './style.css';
import { el, clear } from './ui/dom.js';
import { mountJigsaw } from './jigsaw/index.js';

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

function renderHome() {
  clear(app);
  app.append(
    el('div', { class: 'screen home' }, [
      el('div', { class: 'home-top' }, [
        el('h1', { class: 'home-title' }, 'Hood'),
        el('p', { class: 'home-tag' }, 'Get to know Los Angeles County — piece by piece.'),
      ]),
      el('div', { class: 'home-art' }, '🧩'),
      el('button', { class: 'btn home-play', onClick: () => mountJigsaw(app, { back: renderHome }) }, 'Play'),
      el('p', { class: 'home-note' }, 'Drag the pieces together, then tap one to zoom in.'),
    ]),
  );
}

renderHome();
