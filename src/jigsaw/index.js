// The Jigsaw mode: a zoomable map of LA. Assemble a level's pieces by dragging
// true neighbours together, then tap a piece to zoom into it and assemble the
// next level down — regions → groups → individual neighbourhoods.
//
// This module is just the wiring: for one node it builds the chrome + a Board,
// connects the Board's events to the chrome, and handles navigation between
// nodes (up, breadcrumb jumps, and zooming into a child). All the mechanics live
// in the Board.
import { el, clear } from '../ui/dom.js';
import { screen } from '../ui/chrome.js';
import { ROOT, NODES, pathIds } from './tree.js';
import { Board } from './board.js';
import { breadcrumb, statusBanner, showToast } from './ui.js';
import { showCard } from './card.js';
import { openSearch } from './search.js';
import { store } from '../store.js';

// The board currently on screen — the target for a device shake.
let currentBoard = null;
let shakeInstalled = false;

// A token identifying the active search "fly-through" (zoom out to the county,
// then dive level by level to the searched place). Any manual navigation clears
// it, so a stale fly step can't hijack the screen. See onSearchPick / the descent.
let flyToken = null;
const FLY_DWELL_TOP = 720; // pause on the whole-county view before diving in
const FLY_DWELL_STEP = 360; // pause at each waypoint level on the way down

// Best-effort: shaking the phone scrambles a solved map, the same as shaking it
// by hand. iOS 13+ needs motion permission, which we request on the (user-
// gesture) Play tap; elsewhere it just works. Silently does nothing if blocked.
function setupDeviceShake() {
  if (shakeInstalled || typeof window === 'undefined' || !window.DeviceMotionEvent) return;
  const install = () => {
    if (shakeInstalled) return;
    shakeInstalled = true;
    let lastMag = 0;
    let spikes = [];
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      const now = performance.now();
      if (Math.abs(mag - lastMag) > 13) {
        spikes.push(now);
        while (spikes.length && now - spikes[0] > 600) spikes.shift();
        if (spikes.length >= 5) {
          spikes = [];
          currentBoard?.shakeToScramble();
        }
      }
      lastMag = mag;
    });
  };
  const req = window.DeviceMotionEvent.requestPermission;
  if (typeof req === 'function') req.call(window.DeviceMotionEvent).then((r) => r === 'granted' && install()).catch(() => {});
  else install();
}

export function mountJigsaw(app, { back }) {
  setupDeviceShake();
  renderNode(app, { back }, ROOT, {});
}

function renderNode(app, ctx, nodeId, opts) {
  const node = NODES[nodeId];
  const mode = store.mode(); // 'normal' | 'clean' | 'simple'

  // --- navigation --- (every level arrives already assembled). Any deliberate
  // move cancels an in-flight search fly-through.
  const cancelFly = () => (flyToken = null);
  const goUp = () => {
    cancelFly();
    node.parent ? renderNode(app, ctx, node.parent, { zoomOutFrom: nodeId }) : ctx.back();
  };
  const goTo = (id) => {
    if (id === nodeId) return;
    cancelFly();
    const childToward = pathIds(nodeId)[pathIds(id).length];
    renderNode(app, ctx, id, { zoomOutFrom: childToward });
  };
  const zoomInto = (childId) => {
    cancelFly();
    renderNode(app, ctx, childId, {});
  };

  // Search "flies" to the chosen place: it shows the WHOLE county, then dives down
  // level by level to the smallest grouping that actually contains the place — so
  // the place itself is a visible piece on the board you land on, and you've seen
  // where it sits relative to everything. We render the picked item's PARENT (its
  // children include the picked item) and flash the item once we arrive.
  const onSearchPick = (it) => {
    const isRegion = it.kind === 'region';
    // A region: dive INTO it (its board shows its groups). A place/group: land on
    // its PARENT, where the item is one of the visible pieces, and flash it.
    const displayId = isRegion ? it.id : (NODES[it.id].parent ?? it.id);
    const regionToward = pathIds(displayId)[1] ?? null; // the region under the county
    const token = (flyToken = {});
    renderNode(app, ctx, ROOT, {
      descendTo: displayId,
      highlight: isRegion ? null : it.id,
      toast: isRegion ? null : `${it.label} is in ${it.regionLabel}`,
      zoomOutFrom: regionToward, // an explicit zoom-OUT from the target's region first
      fly: token,
    });
  };
  const searchBtn = el(
    'button',
    { class: 'icon-btn search-btn', onClick: () => openSearch({ onPick: onSearchPick }), 'aria-label': 'Search' },
    '🔍',
  );
  const tools = el('div', { class: 'topbar-tools' }, [searchBtn]);

  // --- chrome ---
  const bannerUi = statusBanner({
    onUp: goUp,
    onSolve: () => board.solve(),
    onScramble: () => board.jumble(),
  });
  const boardWrap = el('div', { class: `jig-board mode-${mode}` });

  // --- board ---
  const board = new Board(nodeId, {
    onRemaining: (remaining) => bannerUi.setCounter(remaining),
    onHint: (text) => bannerUi.setHint(text),
    onSolved: (zoomable, played) => {
      if (played) store.markLearnedZoom();
      // Once they've solved anything, the cue sticks around on every solved board.
      bannerUi.setSolved(zoomable, store.learnedZoom());
    },
    onToast: (msg) => showToast(boardWrap, msg),
    onZoomInto: zoomInto,
    onZoomOut: goUp,
    onSelectLeaf: (id) => showCard(app, id),
    onAction: (mode) => bannerUi.setAction(mode),
  });
  currentBoard = board;
  boardWrap.append(board.svg);

  clear(app);
  app.append(
    screen('Jigsaw', goUp, [breadcrumb(nodeId, goTo), bannerUi.banner, boardWrap], {
      bodyClass: 'jig-body',
      action: tools,
    }),
  );

  // Measure the board so the SVG viewBox matches its aspect (the map fills it
  // with no letterboxing), then build the pieces and start.
  requestAnimationFrame(() => {
    const w = boardWrap.clientWidth || 360;
    const h = boardWrap.clientHeight || 360;
    const vbH = Math.round((1000 * h) / w);
    board.build(vbH, mode);
    board.start({ zoomOutFrom: opts.zoomOutFrom });

    const flying = opts.fly && opts.fly === flyToken;
    if (flying && nodeId !== opts.descendTo) {
      // A waypoint on the way down: pause, then camera-zoom into the next child
      // toward the target and re-render there (carrying the fly forward).
      const next = pathIds(opts.descendTo)[pathIds(nodeId).length];
      const dwell = opts.zoomOutFrom ? FLY_DWELL_TOP : FLY_DWELL_STEP;
      setTimeout(() => {
        if (opts.fly !== flyToken) return; // cancelled by a manual move
        board.zoomToChild(next, () => {
          if (opts.fly !== flyToken) return;
          renderNode(app, ctx, next, {
            descendTo: opts.descendTo,
            highlight: opts.highlight,
            toast: opts.toast,
            fly: opts.fly,
          });
        });
      }, dwell);
    } else if (opts.highlight) {
      // Arrived (or a region landed on the county): flash the found piece + toast,
      // after any zoom-out intro has played.
      setTimeout(() => {
        board.flashPiece(opts.highlight);
        if (opts.toast) showToast(boardWrap, opts.toast);
      }, opts.zoomOutFrom ? 640 : 120);
    } else if (opts.toast) {
      showToast(boardWrap, opts.toast);
    }
  });
}
