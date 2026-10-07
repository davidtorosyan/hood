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
import { catchUp, record, PUZZLES, TROPHIES } from './progress.js';
import { renderOverworld, campaignLine } from './campaign/overworld.js';
import { built, progress } from './campaign/state.js';
import { mountCampaignPuzzle } from './jigsaw/index.js';

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
  store.setScreen('home');
  renderHome();
}

// --- Rebuild LA (the campaign) ---
function openOverworld() {
  unmountJigsaw();
  store.setScreen('campaign');
  renderOverworld(app, { onBack: goHome, onPlay: playCampaign, onExplore: () => playExplore() });
  record('campaign'); // announce any campaign trophy just earned
}

function playCampaign(id) {
  const wasBuilt = built(id);
  mountCampaignPuzzle(app, {
    nodeId: id,
    progressLine: campaignLine,
    back: () => {
      if (!wasBuilt && built(id)) store.campaign.set('fresh', id); // flash it on the map
      openOverworld();
    },
  });
}

function playExplore(node) {
  store.setScreen('explore');
  mountJigsaw(app, { back: goHome, node });
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
  const play = playExplore;
  const cp = progress();
  app.append(
    el('div', { class: 'screen home' }, [
      el('div', { class: 'home-top' }, [
        el('h1', { class: 'home-title' }, 'Hood'),
        el('p', { class: 'home-tag' }, 'Get to know Los Angeles County — piece by piece.'),
      ]),
      el('div', { class: 'home-art' }, homeArt()),
      el('div', { class: 'home-actions' }, [
        // Two ways to play: the campaign (rebuild LA bottom-up, outward from a
        // starting spot) and free exploring (the whole zoomable map, any order).
        el('button', { class: 'btn home-play', onClick: openOverworld }, [
          '🧩 Rebuild LA',
          el('span', { class: 'home-play-sub' }, cp.built ? `${cp.built} of ${cp.total} rebuilt` : 'LA’s been scrambled — put it back'),
        ]),
        el('button', { class: 'btn home-play home-play-2', onClick: () => play(resumeAt ?? ROOT) }, [
          '🗺️ Explore',
          el('span', { class: 'home-play-sub' }, resumeAt ? `Continue · ${labelOf(resumeAt)}` : 'The whole map, any order'),
        ]),
      ]),
      solved || Object.keys(store.trophies()).length
        ? el('button', { class: 'home-progress', onClick: openProgress }, [
            el('span', {}, `🏆 ${Object.keys(store.trophies()).length} of ${TROPHIES.length} trophies`),
            el('span', { class: 'home-progress-sub' }, `Explore: ${solved} of ${PUZZLES.length} solved · see progress`),
          ])
        : null,
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
const last = store.screen();
if (last === 'campaign') openOverworld();
else if (last === 'explore' && store.nav()) mountJigsaw(app, { back: goHome });
else renderHome();
