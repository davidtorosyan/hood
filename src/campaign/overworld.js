// The "Rebuild LA" overworld: the county map you're rebuilding, and the hub
// between puzzles. It starts as an empty outline; built places are in colour,
// each built-but-unlinked puzzle is its own outlined "island", and the
// freeways you've driven are roads between them.
//
// It's a camera, not a static picture (Dave): coming back from a puzzle it
// zooms OUT of that area so you see the piece land; Next flies (out, across,
// in) to the next area before the puzzle opens. In between, the map is yours to
// explore: pan, pinch, names appear as there's room, and tapping a place you've
// built zooms to it or opens its card. Only what you've built is there to see.
import { el, svgEl, clear } from '../ui/dom.js';
import { ROOT, NODES, childrenOf, leavesOf, labelOf, pathIds, shapeOf } from '../jigsaw/tree.js';
import { projectAll, mapAspectOf, labelAnchors } from '../jigsaw/geometry.js';
import { colorForIndex } from '../jigsaw/palette.js';
import { Scheduler } from '../jigsaw/scheduler.js';
import { showCard } from '../jigsaw/card.js';
import { store } from '../store.js';
import { builtLeaves, districtProgress, frontier, offers, progress, finished, topBuilt, isBottom } from './state.js';
import { nextStep, chapterOf, stepTitle, drivenDrives } from './journey.js';
import { lineOf } from '../freeways/puzzles.js';
import { MapView } from './mapview.js';

// The board fits the county's real shape, so there's no dead band around it.
const W = 1000;
const H = Math.round(W / mapAspectOf(ROOT));
const ALL_PLACES = leavesOf(ROOT);
const REGIONS = childrenOf(ROOT);
const regionColor = (leaf) => colorForIndex(REGIONS.indexOf(pathIds(leaf)[1]));
const book = store.campaign;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Where a puzzle sits, for its card: "San Gabriel Valley" / "West San Gabriel · SGV".
const whereOf = (id) => pathIds(id).slice(1, -1).reverse().map(labelOf).join(' · ') || 'LA County';

let live = null;
export function unmountOverworld() {
  live?.dispose();
  live = null;
}

// onBack: home · onPlay(id): play that puzzle · onStep(step): play the
// journey's next step · onExplore: open Explore mode · arriving: puzzle ids
// just built/driven between (the camera starts on them and pulls back).
export function renderOverworld(app, { onBack, onPlay, onStep, onExplore, arriving = null }) {
  unmountOverworld();
  const sched = new Scheduler();
  live = { dispose: () => sched.dispose() };
  const step = nextStep();
  const { links, picks } = offers();
  const front = frontier();
  const have = builtLeaves();
  const fresh = new Set(book.get('fresh') ? leavesOf(book.get('fresh')) : []);
  book.set('fresh', null); // flash it once
  const { built: nBuilt, total } = progress();
  const started = have.size > 0;

  const slots = [...picks, ...front.filter((id) => !picks.includes(id))];

  // --- the map ---
  const svg = svgEl('svg', { class: `ow-map${step ? ' journey' : ''}`, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Map of what you have rebuilt' });
  const { proj, pathOf } = projectAll(REGIONS, [10, 10, W - 10, H - 10]);
  const layer = (cls) => svgEl('g', cls ? { class: cls } : {});
  // The empty board: the county's silhouette. Each region is stroked, then
  // filled on top without a stroke, so only the outer edge shows.
  const board = layer('ow-board');
  for (const r of REGIONS) board.append(svgEl('path', { d: pathOf(r), class: 'ow-board-edge' }));
  for (const r of REGIONS) board.append(svgEl('path', { d: pathOf(r), class: 'ow-board-fill' }));
  // Open slots, whole (their insides are still a mystery).
  const slotLayer = layer();
  for (const id of slots) {
    slotLayer.append(svgEl('path', { d: pathOf(id), class: `ow-slot${picks.includes(id) ? ' offer' : ''}`, 'data-puzzle': id }));
  }
  // What you've built, place by place, then an outline around each island.
  const builtLayer = layer();
  for (const leaf of ALL_PLACES) {
    if (!have.has(leaf)) continue;
    const path = svgEl('path', { d: pathOf(leaf), class: `ow-place${fresh.has(leaf) ? ' ow-fresh' : ''}` });
    path.style.setProperty('--fill', regionColor(leaf));
    path.dataset.place = leaf;
    builtLayer.append(path);
  }
  const islandLayer = layer('ow-outlines');
  for (const id of topBuilt()) islandLayer.append(svgEl('path', { d: pathOf(id), class: 'ow-island' }));
  for (const id of links) islandLayer.append(svgEl('path', { d: pathOf(id), class: 'ow-outline link', 'data-puzzle': id }));
  // The freeways you've driven, as roads between what you've built.
  const roadLayer = layer('ow-roads');
  for (const d of drivenDrives()) {
    for (const b of d.blocks) {
      const pts = lineOf(b).map((c) => proj(c).map((v) => v.toFixed(1)).join(','));
      roadLayer.append(svgEl('path', { d: 'M' + pts.join('L'), class: 'ow-road' }));
    }
  }
  // The next step's spot, ringed.
  if (step && step.kind !== 'drive') islandLayer.append(svgEl('path', { d: pathOf(step.id), class: 'ow-outline next' }));
  const labelLayer = layer('ow-labels');
  svg.append(board, slotLayer, builtLayer, islandLayer, roadLayer, labelLayer);

  // Projected boxes and label spots.
  const ringOf = (id) => shapeOf(id).map((c) => proj(c));
  const boxOf = (ids) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of ids) for (const [x, y] of ringOf(id)) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return [x0, y0, x1 - x0, y1 - y0];
  };
  const labelItem = (id, tier, group) => {
    const ring = ringOf(id);
    const [x, y] = labelAnchors(ring, 6)[0] ?? ring[0];
    return { x, y, size: boxOf([id])[2], text: labelOf(id), tier, group };
  };

  // Which puzzle a tap means (choosing "somewhere else"): a slot, or a link.
  const linkOf = new Map();
  for (const id of links) for (const l of leavesOf(id)) if (!linkOf.has(l)) linkOf.set(l, id);

  // --- the list of what's next ---
  const cards = new Map();
  const card = (id, kind) => {
    const n = childrenOf(id).length;
    let sub;
    if (kind === 'link') sub = `Join your ${n} built pieces into one · ${whereOf(id)}`;
    else if (!started) sub = `${n} places · ${whereOf(id)}`;
    else {
      const d = districtProgress(id);
      sub = `${n} places · ${labelOf(d.parent)} · ${d.built} of ${d.total} built`;
    }
    const btn = el('button', { class: `ow-card ${kind}`, onClick: () => onPlay(id) }, [
      el('span', { class: 'ow-card-icon', 'aria-hidden': 'true' }, kind === 'link' ? '🔗' : '🧩'),
      el('span', { class: 'ow-card-text' }, [
        el('b', {}, kind === 'link' ? `Connect ${labelOf(id)}` : `Build ${labelOf(id)}`),
        el('span', { class: 'ow-card-sub' }, sub),
      ]),
      el('span', { class: 'ow-card-go', 'aria-hidden': 'true' }, '▶'),
    ]);
    cards.set(id, btn);
    return btn;
  };
  const list = el('div', { class: 'ow-list' }, [
    ...links.map((id) => card(id, 'link')),
    ...picks.map((id) => card(id, 'build')),
  ]);

  // --- the camera ---
  const hint = el('div', { class: 'ow-tap-hint', 'aria-hidden': 'true' }, '👆');
  const wrap = el('div', { class: 'ow-map-wrap big' }, [svg, hint]);
  let leaving = false;
  const view = new MapView(svg, {
    W,
    H,
    sched,
    onTap: (target) => {
      if (leaving) return;
      const puzzle = target?.dataset?.puzzle || (svg.classList.contains('picking') ? linkOf.get(target?.dataset?.place) : null);
      if (puzzle && (!step || svg.classList.contains('picking'))) return select(puzzle);
      const leaf = target?.dataset?.place;
      if (!leaf) return;
      // Small on screen → zoom to its group; big enough → its card.
      const group = NODES[leaf].parent;
      if (boxOf([leaf])[2] * view.scale() < 60) return view.flyTo(view.fit(boxOf([group]), 0.15), 650, () => playHint(leaf));
      book.set('cardHint', 'done');
      showCard(leaf);
    },
  });
  view.setLabels(labelLayer, [
    ...book.doneIds().filter((id) => NODES[id] && isBottom(id)).map((id) => labelItem(id, 0, id)),
    ...[...have].map((id) => labelItem(id, 1, NODES[id].parent)),
  ]);

  // Tap a slot (choosing somewhere else): select its card.
  const select = (id) => {
    if (!cards.has(id)) list.prepend(card(id, links.includes(id) ? 'link' : 'build'));
    for (const [cid, c] of cards) c.classList.toggle('selected', cid === id);
    for (const o of svg.querySelectorAll('[data-puzzle]')) o.classList.toggle('selected', o.dataset.puzzle === id);
    cards.get(id).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // A finger tapping a place you've built, once you have a couple: the map is
  // for exploring (no words — Dave doesn't like tips). Until you've opened a card.
  function playHint(leaf) {
    if (book.get('cardHint') === 'done' || !leaf) return;
    const { x, y } = labelItem(leaf, 1);
    const r = svg.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const s = view.scale();
    const [bx, by, bw, bh] = view.box;
    const sx = r.left - wr.left + (r.width - bw * s) / 2 + (x - bx) * s;
    const sy = r.top - wr.top + (r.height - bh * s) / 2 + (y - by) * s;
    hint.style.left = `${sx.toFixed(0)}px`;
    hint.style.top = `${sy.toFixed(0)}px`;
    hint.classList.remove('tapping');
    hint.getBoundingClientRect(); // restart the animation
    hint.classList.add('tapping');
    sched.after(3400, () => hint.classList.remove('tapping'));
  }
  const hintAfterArrival = () => {
    const bottoms = book.doneIds().filter((id) => NODES[id] && isBottom(id));
    if (bottoms.length < 2) return;
    const recent = arriving?.find((id) => NODES[id] && isBottom(id)) ?? bottoms.at(-1);
    playHint(leavesOf(recent)[0]);
  };

  // Next: fly to the next area (out, across, in), then open it.
  const go = () => {
    if (leaving) return;
    leaving = true;
    const target = step.kind === 'drive' ? step.areas : [step.id];
    const open = () => {
      wrap.classList.add('leaving');
      sched.after(160, () => onStep(step));
    };
    if (reduceMotion()) return open();
    view.flyTo(view.fit(boxOf(target), 0.06), 1000, open);
  };
  const nextCard = step
    ? el('button', { class: 'ow-next', onClick: go }, [
        el('span', { class: 'ow-next-chapter' }, chapterOf(step).title),
        el('b', {}, `${step.kind === 'drive' ? '🛣️' : step.kind === 'link' ? '🔗' : '🧩'} ${stepTitle(step)}`),
        el('span', { class: 'ow-next-go', 'aria-hidden': 'true' }, '▶'),
      ])
    : null;

  const intro = finished()
    ? el('div', { class: 'ow-intro done' }, [
        el('b', {}, '🎉 LA is whole again!'),
        el('span', {}, 'Every piece is back where it belongs. Nice work.'),
        el('button', { class: 'btn ow-explore', onClick: onExplore }, 'Explore the map'),
      ])
    : !started
      ? el('div', { class: 'ow-intro' }, [
          el('b', {}, 'Oh no — LA’s been scrambled!'),
          el('span', {}, step ? 'Rebuild it piece by piece, and link it up by freeway.' : 'Rebuild it piece by piece. Pick a spot to start; the map grows outward from there.'),
        ])
      : step
        ? null
        : el('div', { class: 'ow-intro' }, [
            links.length
              ? el('span', { class: 'ow-hint link' }, `🔗 Every piece of ${labelOf(links[0])} is built — connect them!`)
              : el('span', { class: 'ow-hint' }, 'Finish a district and you can connect its pieces into one.'),
          ]);

  clear(app);
  app.append(
    el('div', { class: 'screen' }, [
      el('div', { class: 'topbar' }, [
        el('button', { class: 'icon-btn', onClick: onBack, 'aria-label': 'Home' }, '⌂'),
        el('span', { class: 'topbar-title' }, 'Rebuild LA'),
        started ? el('span', { class: 'ow-count' }, `${nBuilt} / ${total} built`) : null,
      ]),
      el('div', { class: `screen-body ow-body${step ? ' journey' : ''}` }, [
        intro,
        wrap,
        nextCard,
        finished() ? null
          : step ? el('details', { class: 'ow-more', onToggle: (e) => svg.classList.toggle('picking', e.target.open) }, [el('summary', {}, 'Or build somewhere else'), list])
          : el('h2', { class: 'pg-h' }, started ? 'Up next' : 'Where to start?'),
        finished() || step ? null : list,
      ]),
    ]),
  );

  // Camera: start on what you just built and pull back to the county; else
  // the whole county.
  const arrivingIds = (arriving || []).filter((id) => NODES[id]);
  if (arrivingIds.length && !reduceMotion()) {
    view.set(view.fit(boxOf(arrivingIds), 0.06));
    sched.after(350, () => view.flyTo(view.full(), 1100, hintAfterArrival));
  } else {
    view.set(view.full());
    sched.after(400, hintAfterArrival);
  }
}

// For the puzzle screen's tray: "🧩 12 of 69 puzzles rebuilt".
export function campaignLine() {
  const { built: n, total } = progress();
  return `🧩 ${n} of ${total} puzzles rebuilt`;
}
