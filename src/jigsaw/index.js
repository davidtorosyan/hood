// The Jigsaw mode: a zoomable map of LA. Assemble a level's pieces, then tap a
// piece to zoom into it and assemble the next level down — regions → groups →
// individual places.
//
// This module is just the wiring: for one node it builds the chrome + a Board,
// connects the Board's events to the chrome, and handles navigation between
// nodes (up, breadcrumb jumps, zooming into a child, the search fly-through).
// All the mechanics live in the Board. Exactly one Board is alive at a time:
// every render destroys the previous one first, so nothing stale can fire.
import { el, clear } from '../ui/dom.js';
import { ROOT, NODES, pathIds, childrenOf } from './tree.js';
import { colorForIndex } from './palette.js';
import { Board, ZOOM_MS } from './board.js';
import { breadcrumb, actionButton } from './ui.js';
import { statsOf, fmtArea, fmtPeople } from './stats.js';
import { showCard } from './card.js';
import { openSearch } from './search.js';
import { openBugReport } from '../bugreport.js';
import { countEvent } from '../telemetry.js';
import { record } from '../progress.js';
import { store } from '../store.js';

const FLY_DWELL_UP = 140; // extra pause after a zoom-OUT step settles
const FLY_DWELL_DOWN = 220; // pause before each zoom-IN step

let board = null; // the one live Board
let current = null; // { app, ctx, nodeId, w, h } — what's on screen, for resize

// Rotating the phone or resizing the window re-lays the level out for the new
// shape (a puzzle in progress comes back via its save, re-packed). Debounced,
// and never mid-animation.
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!current || !board?.idle()) return;
    const wrap = document.querySelector('.jig-board');
    if (!wrap) return;
    const dw = Math.abs(wrap.clientWidth - current.w);
    const dh = Math.abs(wrap.clientHeight - current.h);
    if (dw > 24 || dh > 24) renderNode(current.app, current.ctx, current.nodeId, { autoPlay: true });
  }, 250);
});

// Open the jigsaw at `node` (default: the saved spot, else the county).
export function mountJigsaw(app, { back, node } = {}) {
  const saved = store.nav()?.node;
  const at = node ?? (saved && NODES[saved] ? saved : ROOT);
  store.setAtHome(false);
  renderNode(app, { back }, at, { autoPlay: true });
}

// Leaving the jigsaw: stop the live board so nothing keeps running behind home.
export function unmountJigsaw() {
  board?.destroy();
  board = null;
  current = null;
}

// opts: { autoPlay, zoomOutFrom, fly: { route, step, highlight } }
function renderNode(app, ctx, nodeId, opts = {}) {
  board?.destroy();
  const node = NODES[nodeId];

  // --- navigation ---
  const goUp = () => {
    if (!node.parent) return ctx.back();
    const up = () => renderNode(app, ctx, node.parent, { zoomOutFrom: nodeId });
    // Two-step zoom-out: smoosh this level's pieces into the single parent region
    // (in the parent's colour), then camera-zoom out to it. Skipped mid-puzzle.
    me.collapse(colorIn(node.parent, nodeId), node.label, up);
  };
  const goTo = (id) => {
    if (id === nodeId) return;
    const childToward = pathIds(id).length < pathIds(nodeId).length ? pathIds(nodeId)[pathIds(id).length] : null;
    renderNode(app, ctx, id, { zoomOutFrom: childToward });
  };

  // A "fly-through" to another board: from here it zooms OUT step by step to the
  // nearest common ancestor, then back IN step by step to `displayId` — so you
  // watch how it relates to where you were. `highlight` flashes on arrival.
  const flyTo = (displayId, highlight = null) => {
    const pCur = pathIds(nodeId);
    const pTgt = pathIds(displayId);
    let lca = 0; // index of the deepest shared ancestor
    while (lca + 1 < pCur.length && lca + 1 < pTgt.length && pCur[lca + 1] === pTgt[lca + 1]) lca++;
    const route = [...pCur.slice(lca, pCur.length - 1).reverse(), ...pTgt.slice(lca + 1)];
    const fly = { route, step: 0, highlight };
    if (!route.length) return void me.flashPiece(highlight);
    flyStep(fly, false);
  };
  // Search: a region opens its own board; anything else lands on the board where
  // it's a visible piece (its parent), flashing.
  const onSearchPick = (it) => {
    countEvent('search');
    if (it.kind === 'region') flyTo(it.id);
    else flyTo(NODES[it.id].parent, it.id);
  };
  // A tapped surrounding area: open its board (or, for a single place, its
  // parent's, with it flashing).
  const onGoTo = (id) => {
    countEvent('context-tap');
    if (NODES[id].children?.length) flyTo(id);
    else flyTo(NODES[id].parent, id);
  };

  // Take the next hop of a fly-through from the live board, if it's idle (any
  // tap/zoom the player started in the meantime simply wins).
  const flyStep = (fly, arrivedByZoomOut) => {
    const dwell = arrivedByZoomOut ? ZOOM_MS + FLY_DWELL_UP : FLY_DWELL_DOWN;
    me.sched.after(dwell, () => {
      if (!me.idle()) return;
      const next = fly.route[fly.step];
      const nextFly = { ...fly, step: fly.step + 1 };
      if (NODES[nodeId].parent === next) {
        me.collapse(colorIn(next, nodeId), node.label, () =>
          renderNode(app, ctx, next, { zoomOutFrom: nodeId, fly: nextFly }),
        );
      } else {
        me.zoomInto(next, () => renderNode(app, ctx, next, { fly: nextFly }));
      }
    });
  };

  // --- chrome ---
  const ctrl = actionButton({ onUp: goUp, onSolve: () => me.solve(), isRoot: !node.parent });
  const boardWrap = el('div', { class: 'jig-board' });
  const st = statsOf(nodeId);
  const statBits = [`${fmtArea(st.area)} sq mi`];
  if (st.pop > 0) statBits.push(`${fmtPeople(st.pop)} people`);

  const me = new Board(nodeId, {
    onZoomInto: (childId) => renderNode(app, ctx, childId, { autoPlay: true }),
    onZoomOut: goUp,
    onGoTo,
    onSelectLeaf: (id) => showCard(id),
    onAction: (mode) => ctrl.setAction(mode),
    onEvent: (name, data) => {
      if (name !== 'piece-placed') countEvent(name); // (too chatty to send every piece)
      if (name === 'piece-placed') record('placed');
      else if (name === 'puzzle-solved') record('solved', data);
      else if (name === 'card-open') record('card');
    },
    onPersist: () => store.savePuzzle(nodeId, me.serialize()),
  });
  board = me;
  boardWrap.append(me.root);

  clear(app);
  app.append(
    el('div', { class: 'screen' }, [
      el('div', { class: 'topbar jig-topbar' }, [
        el('button', { class: 'icon-btn', onClick: () => ctx.back(), 'aria-label': 'Home' }, '⌂'),
        breadcrumb(nodeId, goTo),
        el('button', { class: 'search-btn', onClick: () => openSearch({ onPick: onSearchPick }) }, '🔍 Search'),
      ]),
      el('div', { class: 'screen-body jig-body' }, [
        el('div', { class: 'jig-subbar' }, [
          el('div', { class: 'jig-stats' }, statBits.join('  ·  ')),
          ctrl.button,
        ]),
        boardWrap,
        el('div', { class: 'jig-footer' }, [
          el('button', { class: 'report-link', onClick: openBugReport }, 'Report an issue'),
        ]),
      ]),
    ]),
  );
  store.saveNav({ node: nodeId });
  record('visit', { id: nodeId });

  // Measure the board so the SVG viewBox matches its aspect, then build and start
  // — synchronously right after the append (reading clientWidth forces layout),
  // so a zoom-out never flashes an empty board for a frame.
  const w = boardWrap.clientWidth || 360;
  const h = boardWrap.clientHeight || 360;
  me.build(Math.round((1000 * h) / w), w);
  current = { app, ctx, nodeId, w, h };
  const restore = store.puzzle(nodeId);
  me.start({
    zoomOutFrom: opts.zoomOutFrom,
    restore,
    // A puzzle you haven't finished starts itself when you arrive the normal way
    // (Play, or zooming in). Browsing (search, breadcrumbs, zooming out) shows it
    // assembled, with a button to play.
    autoPlay: !!opts.autoPlay && !restore && !store.progress(nodeId),
  });

  const fly = opts.fly;
  if (fly) {
    if (fly.step < fly.route.length) flyStep(fly, opts.zoomOutFrom != null);
    else if (fly.highlight) {
      me.sched.after(opts.zoomOutFrom != null ? ZOOM_MS + 60 : 150, () => me.flashPiece(fly.highlight));
    }
  }
}

// The colour `childId` wears on its parent's board (for the zoom-out smoosh).
const colorIn = (parentId, childId) => colorForIndex(childrenOf(parentId).indexOf(childId));
