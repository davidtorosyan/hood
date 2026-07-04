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
import { ROOT, NODES, pathIds, childrenOf } from './tree.js';
import { colorForIndex } from './palette.js';
import { Board } from './board.js';
import { breadcrumb, actionButton, showToast } from './ui.js';
import { statsOf, fmtArea, fmtPeople } from './stats.js';
import { showCard } from './card.js';
import { openSearch } from './search.js';
import { openBugReport } from '../bugreport.js';
import { store } from '../store.js';

// The board currently on screen — the target for a device shake.
let currentBoard = null;
let shakeInstalled = false;

// A token identifying the active search "fly-through" (zoom out to the county,
// then dive level by level to the searched place). Any manual navigation clears
// it, so a stale fly step can't hijack the screen. See onSearchPick / the descent.
let flyToken = null;
const FLY_ZOOM_MS = 600; // matches the Board's camera zoom; a zoom-out step waits this out
const FLY_DWELL_UP = 140; // extra pause after a zoom-OUT step settles
const FLY_DWELL_DOWN = 220; // pause before each zoom-IN step

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

// `resume` (optional) is a saved { node, board } to drop straight back into.
export function mountJigsaw(app, { back, resume } = {}) {
  setupDeviceShake();
  const at = resume && NODES[resume.node] ? resume.node : ROOT;
  renderNode(app, { back }, at, { restore: at === resume?.node ? resume.board : null });
}

function renderNode(app, ctx, nodeId, opts) {
  const node = NODES[nodeId];
  const mode = store.mode(); // 'normal' | 'clean' | 'simple'

  // --- navigation --- (every level arrives already assembled). Any deliberate
  // move cancels an in-flight search fly-through.
  const cancelFly = () => (flyToken = null);
  const goUp = () => {
    cancelFly();
    if (!node.parent) return ctx.back();
    const up = () => renderNode(app, ctx, node.parent, { zoomOutFrom: nodeId });
    // Two-step zoom-out: first smoosh this level's pieces into the single parent
    // region (in the parent's colour), then camera-zoom out to it. Only when the
    // map is solved; otherwise go straight up.
    if (board.phase === 'solved') {
      const color = colorForIndex(childrenOf(node.parent).indexOf(nodeId));
      board.collapse(color, NODES[nodeId].label, up);
    } else {
      up();
    }
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

  // Search "flies" to the chosen place: from where you are now it zooms OUT step
  // by step to the nearest common ancestor, then back IN step by step to the
  // smallest grouping that actually contains the place — so the place is a visible
  // piece on the board you land on and you've watched how it relates to where you
  // were. We render the picked item's PARENT (its children include the item) and
  // flash the item on arrival.
  const onSearchPick = (it) => {
    const isRegion = it.kind === 'region';
    // A region: dive INTO it (its board shows its groups). A place/group: land on
    // its PARENT, where the item is one of the visible pieces.
    const displayId = isRegion ? it.id : (NODES[it.id].parent ?? it.id);
    const pCur = pathIds(nodeId);
    const pTgt = pathIds(displayId);
    let lca = 0; // index of the deepest shared ancestor on both paths
    while (lca + 1 < pCur.length && lca + 1 < pTgt.length && pCur[lca + 1] === pTgt[lca + 1]) lca++;
    const up = pCur.slice(lca, pCur.length - 1).reverse(); // current's parent … up to the LCA
    const down = pTgt.slice(lca + 1); // the LCA's child … down to displayId
    const route = [...up, ...down];
    const token = (flyToken = {});
    // Re-render where we are with the fly attached; its step driver walks `route`.
    renderNode(app, ctx, nodeId, {
      flyRoute: route,
      flyStep: 0,
      highlight: isRegion ? null : it.id,
      fly: token,
    });
  };
  const searchBtn = el(
    'button',
    { class: 'search-btn', onClick: () => openSearch({ onPick: onSearchPick }), 'aria-label': 'Search' },
    '🔍 Search',
  );
  const bugBtn = el(
    'button',
    { class: 'icon-btn bug-icon', onClick: openBugReport, 'aria-label': 'Report a bug', title: 'Report a bug' },
    '🐞',
  );
  const tools = el('div', { class: 'topbar-tools' }, [bugBtn, searchBtn]);

  // --- chrome ---
  // The Solve/zoom-out control rides the breadcrumb row (no dedicated header bar).
  const ctrl = actionButton({ onUp: goUp, onSolve: () => board.solve() });
  const boardWrap = el('div', { class: `jig-board mode-${mode}` });

  // --- board ---
  const board = new Board(nodeId, {
    onToast: (msg) => showToast(boardWrap, msg),
    onZoomInto: zoomInto,
    onZoomOut: goUp,
    onSelectLeaf: (id) => showCard(app, id),
    onAction: (mode) => ctrl.setAction(mode),
    // Remember where we are + the puzzle in progress, so a reload restores it.
    onPersist: () => store.saveNav({ node: nodeId, board: board.serialize() }),
  });
  currentBoard = board;
  boardWrap.append(board.root);

  // Aggregate area + population for the level you're on, under the breadcrumb.
  const st = statsOf(nodeId);
  const statBits = [`${fmtArea(st.area)} sq mi`];
  if (st.pop > 0) statBits.push(`${fmtPeople(st.pop)} people`);

  clear(app);
  app.append(
    screen('Jigsaw', goUp, [
      el('div', { class: 'jig-header' }, [
        el('div', { class: 'jig-crumb-row' }, [breadcrumb(nodeId, goTo), ctrl.button]),
        el('div', { class: 'jig-stats' }, statBits.join('  ·  ')),
      ]),
      boardWrap,
    ], { bodyClass: 'jig-body', action: tools }),
  );

  // Measure the board so the SVG viewBox matches its aspect (the map fills it with
  // no letterboxing), then build the pieces and start — synchronously right after
  // the append (reading clientWidth forces layout), so a zoom-out never flashes an
  // empty board for a frame before the map appears.
  {
    const w = boardWrap.clientWidth || 360;
    const h = boardWrap.clientHeight || 360;
    const vbH = Math.round((1000 * h) / w);
    board.build(vbH, mode);
    board.start({ zoomOutFrom: opts.zoomOutFrom, restore: opts.restore });

    const flying = opts.fly && opts.fly === flyToken;
    if (!flying) return;
    const arrivedByZoomOut = opts.zoomOutFrom != null; // this node played a reverse-zoom intro

    if (opts.flyStep < opts.flyRoute.length) {
      // Take the next hop along the route: a step UP zooms out (render the parent,
      // which reverse-zooms from us); a step DOWN zooms the camera into the child.
      const next = opts.flyRoute[opts.flyStep];
      const goingUp = NODES[nodeId].parent === next;
      const dwell = arrivedByZoomOut ? FLY_ZOOM_MS + FLY_DWELL_UP : FLY_DWELL_DOWN;
      const nextOpts = {
        flyRoute: opts.flyRoute,
        flyStep: opts.flyStep + 1,
        highlight: opts.highlight,
        fly: opts.fly,
      };
      setTimeout(() => {
        if (opts.fly !== flyToken) return; // cancelled by a manual move
        if (goingUp) {
          // Same two-step as a manual zoom-out: smoosh this level into its region,
          // then render the parent (which reverse-zooms out to it).
          const color = colorForIndex(childrenOf(next).indexOf(nodeId));
          board.collapse(color, NODES[nodeId].label, () => {
            if (opts.fly === flyToken) renderNode(app, ctx, next, { ...nextOpts, zoomOutFrom: nodeId });
          });
        } else {
          board.zoomToChild(next, () => {
            if (opts.fly === flyToken) renderNode(app, ctx, next, nextOpts);
          });
        }
      }, dwell);
    } else if (opts.highlight) {
      // Arrived: flash the found piece (after any reverse-zoom intro has played).
      setTimeout(
        () => opts.fly === flyToken && board.flashPiece(opts.highlight),
        arrivedByZoomOut ? FLY_ZOOM_MS + 60 : 150,
      );
    }
  }
}
