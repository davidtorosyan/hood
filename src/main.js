import './style.css';
import { el, svgEl, clear } from './ui/dom.js';
import { mountJigsaw, unmountJigsaw } from './jigsaw/index.js';
import { NODES, ROOT, labelOf } from './jigsaw/tree.js';
import { projectChildren } from './jigsaw/geometry.js';
import { colorForIndex } from './jigsaw/palette.js';
import { store } from './store.js';
import { initTelemetry, BUILD } from './telemetry.js';
import { openBugReport } from './bugreport.js';
import { initPwa } from './pwa.js';
import { renderProgress } from './progressScreen.js';
import { catchUp, PUZZLES, TROPHIES } from './progress.js';

initTelemetry();

if (import.meta.env.DEV) {
  // In dev, kill any stale PWA service worker + caches. The dev server's port can
  // cycle (5173/5175/…) and come back; a service worker registered for this
  // host:port in an earlier session then intercepts `/hood/` and serves stale
  // assets. We never want a SW during local dev. (Production keeps its PWA.)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
} else {
  initPwa();
}

const app = document.querySelector('#app');

catchUp(); // trophies already earned (e.g. before trophies existed), awarded quietly

function goHome() {
  unmountJigsaw();
  store.setAtHome(true);
  renderHome();
}

// The county map as cover art: the seven regions in their map colours.
function homeArt() {
  const W = 1000;
  const H = 560;
  const svg = svgEl('svg', { class: 'home-map', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Map of LA County regions' });
  for (const [i, g] of projectChildren(ROOT, [0, 0, W, H]).entries()) {
    svg.append(svgEl('path', { d: g.d, style: `fill:${colorForIndex(i)}` }));
  }
  return svg;
}

function openProgress() {
  renderProgress(app, { onBack: renderHome, onPlay: (node) => mountJigsaw(app, { back: goHome, node }) });
}

function renderHome() {
  clear(app);
  const nav = store.nav();
  const resumeAt = nav && NODES[nav.node] && nav.node !== ROOT ? nav.node : null;
  const solved = store.solvedCount();
  const play = (node) => mountJigsaw(app, { back: goHome, node });
  app.append(
    el('div', { class: 'screen home' }, [
      el('div', { class: 'home-top' }, [
        el('h1', { class: 'home-title' }, 'Hood'),
        el('p', { class: 'home-tag' }, 'Get to know Los Angeles County — piece by piece.'),
      ]),
      el('div', { class: 'home-art' }, homeArt()),
      el('div', { class: 'home-actions' }, [
        resumeAt
          ? el('button', { class: 'btn home-play', onClick: () => play(resumeAt) }, [
              'Continue',
              el('span', { class: 'home-play-sub' }, labelOf(resumeAt)),
            ])
          : el('button', { class: 'btn home-play', onClick: () => play(ROOT) }, solved ? 'Play' : 'Start'),
        resumeAt ? el('button', { class: 'home-secondary', onClick: () => play(ROOT) }, 'Start from the whole county') : null,
      ]),
      solved || Object.keys(store.trophies()).length
        ? el('button', { class: 'home-progress', onClick: openProgress }, [
            el('span', {}, `🏆 ${solved} of ${PUZZLES.length} puzzles`),
            el('span', { class: 'home-progress-sub' }, `${Object.keys(store.trophies()).length} of ${TROPHIES.length} trophies · see progress`),
          ])
        : el('p', { class: 'home-note' }, 'Rebuild the map one named piece at a time, then tap a piece to zoom in.'),
      el('div', { class: 'home-foot' }, [
        el('button', { class: 'home-report', onClick: openBugReport }, 'Report an issue'),
        el('span', { class: 'home-build' }, BUILD),
      ]),
    ]),
  );
}

// Relaunch where they left off — unless they'd gone back to home.
const nav = store.nav();
if (nav && !NODES[nav.node]) store.clearNav(); // stale (data changed under it)
if (store.nav() && !store.atHome()) mountJigsaw(app, { back: goHome });
else renderHome();
