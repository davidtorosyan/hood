// The "Rebuild LA" overworld: the county map you're rebuilding, and the hub
// between puzzles. It starts as an empty outline; what you've built is in
// colour — zoomed out as the GROUPS you built (logical chunks to zoom into,
// like Explore, in the colours their puzzles merge into), zoomed in as the
// places inside them. The freeways you've driven are roads between them.
//
// It's a camera (Dave): finishing a puzzle, Next pulls back out of that area
// so you see the piece land, then flies straight on into the next area — one
// press. Touch the map on the way and it stops there for you to look around.
// Opened from home (or ← from a puzzle) it rests on what you've built, a
// little zoomed in so your progress reads; the slider on the right zooms
// between that and all of LA.
import { el, svgEl, clear } from '../ui/dom.js';
import { ROOT, NODES, childrenOf, leavesOf, labelOf, pathIds, shapeOf } from '../jigsaw/tree.js';
import { projectAll, mapAspectOf, labelAnchors } from '../jigsaw/geometry.js';
import { colorForIndex } from '../jigsaw/palette.js';
import { Scheduler } from '../jigsaw/scheduler.js';
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
const book = store.campaign;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// A child's colour in its parent's puzzle (what the jigsaw shows).
const colorIn = (id) => colorForIndex(childrenOf(NODES[id].parent).indexOf(id));
// Places show (instead of the groups they make) once a group is this wide on screen.
const DETAIL_PX = 190;

// Where a puzzle sits, for its card: "San Gabriel Valley" / "West San Gabriel · SGV".
const whereOf = (id) => pathIds(id).slice(1, -1).reverse().map(labelOf).join(' · ') || 'LA County';

let live = null;
export function unmountOverworld() {
  live?.dispose();
  live = null;
}

// onBack: home · onPlay(id): play that puzzle · onStep(step): play the
// journey's next step · onExplore: open Explore mode · arriving: puzzle ids
// just built/driven between (the camera starts on them and pulls back) ·
// onward: then carry straight on to the next step.
export function renderOverworld(app, { onBack, onPlay, onStep, onExplore, arriving = null, onward = false }) {
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
  const groups = book.doneIds().filter((id) => NODES[id] && isBottom(id));

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
  // What you've built: the groups (zoomed out) and their places (zoomed in).
  const groupLayer = layer('ow-groups');
  for (const id of groups) {
    const path = svgEl('path', { d: pathOf(id), class: `ow-group${leavesOf(id).some((l) => fresh.has(l)) ? ' ow-fresh' : ''}` });
    path.style.setProperty('--fill', colorIn(id));
    path.dataset.group = id;
    groupLayer.append(path);
  }
  const placeLayer = layer('ow-places');
  for (const leaf of ALL_PLACES) {
    if (!have.has(leaf)) continue;
    const path = svgEl('path', { d: pathOf(leaf), class: 'ow-place' });
    path.style.setProperty('--fill', colorIn(leaf));
    path.dataset.group = NODES[leaf].parent;
    placeLayer.append(path);
  }
  const islandLayer = layer('ow-outlines');
  for (const id of topBuilt()) islandLayer.append(svgEl('path', { d: pathOf(id), class: 'ow-island' }));
  for (const id of links) islandLayer.append(svgEl('path', { d: pathOf(id), class: 'ow-outline link', 'data-puzzle': id }));
  // Where you're going next: a quiet dashed hint (Next is the button, not this).
  if (step && step.kind !== 'drive') islandLayer.append(svgEl('path', { d: pathOf(step.id), class: 'ow-outline next' }));
  // The freeways you've driven, as roads between what you've built.
  const roadLayer = layer('ow-roads');
  for (const d of drivenDrives()) {
    for (const b of d.blocks) {
      const pts = lineOf(b).map((c) => proj(c).map((v) => v.toFixed(1)).join(','));
      roadLayer.append(svgEl('path', { d: 'M' + pts.join('L'), class: 'ow-road' }));
    }
  }
  const labelLayer = layer('ow-labels');
  svg.append(board, slotLayer, groupLayer, placeLayer, islandLayer, roadLayer, labelLayer);

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
  const labelItem = (id, tier) => {
    const ring = ringOf(id);
    const [x, y] = labelAnchors(ring, 6)[0] ?? ring[0];
    return { x, y, size: boxOf([id])[2], text: labelOf(id), tier };
  };
  // A typical built group's width (svg units): the detail switch keys off it.
  const groupWidth = groups.length ? groups.map((id) => boxOf([id])[2]).sort((a, b) => a - b)[groups.length >> 1] : 0;

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
  const select = (id) => {
    if (!cards.has(id)) list.prepend(card(id, links.includes(id) ? 'link' : 'build'));
    for (const [cid, c] of cards) c.classList.toggle('selected', cid === id);
    for (const o of svg.querySelectorAll('[data-puzzle]')) o.classList.toggle('selected', o.dataset.puzzle === id);
    cards.get(id).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // --- the camera ---
  // The slider zooms between all of LA (bottom) and what you've built (top).
  const slider = el('input', { type: 'range', class: 'ow-zoom', min: 0, max: 1000, value: 0, 'aria-label': 'Zoom' });
  const wrap = el('div', { class: 'ow-map-wrap big' }, [svg, groups.length ? slider : null]);
  let leaving = false;
  let carryOn = null; // the pending "fly on to the next step" (cancelled by a touch)
  const stay = () => {
    if (carryOn != null) sched.cancel(carryOn);
    carryOn = null;
  };
  const view = new MapView(svg, {
    W,
    H,
    sched,
    onTouch: stay,
    onView: (box) => {
      const px = view.scale();
      const detail = groupWidth * px > DETAIL_PX;
      view.detail = detail;
      svg.classList.toggle('detail', detail);
      if (!sliding) slider.value = String(Math.round(1000 * zoomFrac(box)));
    },
    onTap: (target) => {
      if (leaving) return;
      const puzzle = target?.dataset?.puzzle || (svg.classList.contains('picking') ? linkOf.get(target?.dataset?.place) : null);
      if (puzzle && (!step || svg.classList.contains('picking'))) return select(puzzle);
      // Tapping a group you've built zooms into it (the overworld is for
      // looking around; place cards live in the puzzles).
      const group = target?.dataset?.group;
      if (group) view.flyTo(view.fit(boxOf([group]), 0.18), 650);
    },
  });
  view.setLabels(labelLayer, [
    ...groups.map((id) => labelItem(id, 0)),
    ...[...have].map((id) => labelItem(id, 1)),
  ]);
  // Your area: what you've built (plus where you're headed), roomily.
  const target = step ? (step.kind === 'drive' ? step.areas : [step.id]) : [];
  const localBox = () => view.fit(boxOf([...groups, ...target.filter((id) => NODES[id])]), 0.35);
  const zoomFrac = (box) => {
    const [f, l] = [view.full(), localBox()];
    const span = Math.log(f[2]) - Math.log(l[2]);
    return span > 0 ? Math.max(0, Math.min(1, (Math.log(f[2]) - Math.log(box[2])) / span)) : 0;
  };
  let sliding = false;
  slider.addEventListener('input', () => {
    stay();
    sliding = true;
    view.flight?.cancel?.();
    view.set(MapView.lerp(view.full(), localBox(), Number(slider.value) / 1000));
    sliding = false;
  });
  slider.addEventListener('pointerdown', stay);

  // Next: fly to the next area (out, across, in), then open it.
  const go = () => {
    if (leaving || !step) return;
    stay();
    leaving = true;
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

  // --- where the camera starts, and what it does ---
  // Resting view: your area. After your very first build, Next pulls all the
  // way out once — there's a lot of LA left — before flying on.
  const arrivingIds = (arriving || []).filter((id) => NODES[id]);
  const firstTime = groups.length === 1 && !book.get('seenWhole');
  const rest = () => (!groups.length ? view.full() : localBox());
  if (!arrivingIds.length || reduceMotion()) {
    view.set(rest());
    if (onward && step) carryOn = sched.after(600, go);
    return;
  }
  view.set(view.fit(boxOf(arrivingIds), 0.06));
  const pullBack = onward && firstTime ? view.full() : rest();
  if (onward && firstTime) book.set('seenWhole', true);
  sched.after(300, () =>
    view.flyTo(pullBack, onward && firstTime ? 1300 : 1000, () => {
      if (onward && step) carryOn = sched.after(firstTime ? 1300 : 700, go);
    }),
  );
}

// For the puzzle screen's tray: "🧩 12 of 69 puzzles rebuilt".
export function campaignLine() {
  const { built: n, total } = progress();
  return `🧩 ${n} of ${total} puzzles rebuilt`;
}
