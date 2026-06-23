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

// The board currently on screen — the target for a device shake.
let currentBoard = null;
let shakeInstalled = false;

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

  // --- navigation --- (every level arrives already assembled)
  const goUp = () =>
    node.parent
      ? renderNode(app, ctx, node.parent, { zoomOutFrom: nodeId })
      : ctx.back();
  const goTo = (id) => {
    if (id === nodeId) return;
    const childToward = pathIds(nodeId)[pathIds(id).length];
    renderNode(app, ctx, id, { zoomOutFrom: childToward });
  };
  const zoomInto = (childId) => renderNode(app, ctx, childId, {});

  // --- chrome ---
  const bannerUi = statusBanner({
    onUp: goUp,
    onSolve: () => board.solve(),
    onScramble: () => board.jumble(),
  });
  const boardWrap = el('div', { class: 'jig-board' });

  // --- board ---
  const board = new Board(nodeId, {
    onRemaining: (remaining) => bannerUi.setCounter(remaining),
    onHint: (text) => bannerUi.setHint(text),
    onSolved: (zoomable) => bannerUi.setSolved(zoomable),
    onToast: (msg) => showToast(boardWrap, msg),
    onZoomInto: zoomInto,
    onZoomOut: goUp,
    onSelectLeaf: (id) => showCard(app, id),
    onControls: (canSolve, canScramble) => bannerUi.setControls(canSolve, canScramble),
  });
  currentBoard = board;
  boardWrap.append(board.svg);

  clear(app);
  app.append(
    screen('Jigsaw', goUp, [breadcrumb(nodeId, goTo), bannerUi.banner, boardWrap], {
      bodyClass: 'jig-body',
    }),
  );

  // Measure the board so the SVG viewBox matches its aspect (the map fills it
  // with no letterboxing), then build the pieces and start.
  requestAnimationFrame(() => {
    const w = boardWrap.clientWidth || 360;
    const h = boardWrap.clientHeight || 360;
    const vbH = Math.round((1000 * h) / w);
    board.build(vbH);
    board.start(opts);
  });
}
