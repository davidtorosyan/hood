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
const REGIONS = childrenOf(ROOT);
const book = store.campaign;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// A child's colour in its parent's puzzle (what the jigsaw shows).
const colorIn = (id) => colorForIndex(childrenOf(NODES[id].parent).indexOf(id));
// A built area opens up into its parts (district → groups → places) once
// it's this wide on screen — like zooming in Explore.
const OPEN_PX = 240;

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
  const freshId = book.get('fresh');
  const fresh = new Set(freshId && NODES[freshId] ? leavesOf(freshId) : []);
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
  // What you've built, as a tree: each island (the biggest thing you've
  // connected — Central L.A., or a lone group) and, inside it, its parts down
  // to the places. Zoomed out you see the island whole; zoom in and it opens
  // into its parts, level by level, like Explore. Each in the colour it has in
  // its parent's puzzle (what that puzzle merged into).
  const tops = topBuilt();
  const builtLayer = layer('ow-built');
  const nodeEls = new Map(); // id → path
  const topOf = new Map(); // id → its island
  const kidsOf = (id) => childrenOf(id);
  const isLeaf = (id) => !kidsOf(id).length;
  const addNode = (id, top) => {
    const path = svgEl('path', { d: pathOf(id), class: `ow-node${isLeaf(id) ? ' leaf' : ''}${leavesOf(id).every((l) => fresh.has(l)) && fresh.size ? ' ow-fresh' : ''}` });
    path.style.setProperty('--fill', colorIn(id));
    path.dataset.node = id;
    builtLayer.append(path);
    nodeEls.set(id, path);
    topOf.set(id, top);
    for (const c of kidsOf(id)) addNode(c, top);
  };
  for (const t of tops) addNode(t, t);
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
  const stitchLayer = layer('ow-stitch');
  svg.append(board, slotLayer, builtLayer, islandLayer, roadLayer, stitchLayer, labelLayer);

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
  const widths = new Map([...nodeEls.keys()].map((id) => [id, boxOf([id])[2]]));
  const labelItem = (id) => {
    const ring = ringOf(id);
    const [x, y] = labelAnchors(ring, 6)[0] ?? ring[0];
    return { id, x, y, size: widths.get(id), text: labelOf(id), tier: isLeaf(id) ? 1 : 0 };
  };
  // Which built areas show at this zoom: an area opens into its parts once
  // it's OPEN_PX wide on screen; its parts may open in turn.
  let shown = new Set();
  let pinned = null; // an area kept whole however close (just stitched together)
  const updateShown = (px) => {
    const next = new Set();
    const walk = (id) => {
      if (!isLeaf(id) && id !== pinned && widths.get(id) * px > OPEN_PX) kidsOf(id).forEach(walk);
      else next.add(id);
    };
    tops.forEach(walk);
    for (const [id, path] of nodeEls) path.classList.toggle('on', next.has(id));
    shown = next;
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
  const select = (id) => {
    if (!cards.has(id)) list.prepend(card(id, links.includes(id) ? 'link' : 'build'));
    for (const [cid, c] of cards) c.classList.toggle('selected', cid === id);
    for (const o of svg.querySelectorAll('[data-puzzle]')) o.classList.toggle('selected', o.dataset.puzzle === id);
    cards.get(id).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // --- the camera ---
  // The slider zooms between all of LA (bottom) and what you've built (top).
  const slider = el('input', { type: 'range', class: 'ow-zoom', min: 0, max: 1000, value: 0, 'aria-label': 'Zoom' });
  const wrap = el('div', { class: 'ow-map-wrap big' }, [svg, tops.length ? slider : null]);
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
      updateShown(view.scale());
      if (!sliding) slider.value = String(Math.round(1000 * zoomFrac(box)));
    },
    onTap: (target) => {
      if (leaving) return;
      const puzzle = target?.dataset?.puzzle || (svg.classList.contains('picking') ? linkOf.get(target?.dataset?.place) : null);
      if (puzzle && (!step || svg.classList.contains('picking'))) return select(puzzle);
      // Tapping an area you've built zooms into it, opening it into its parts
      // (the overworld is for looking around; place cards live in the puzzles).
      const node = target?.dataset?.node;
      if (node && !isLeaf(node)) view.flyTo(view.fit(boxOf([node]), 0.12), 650);
    },
  });
  view.labelFilter = (it) => shown.has(it.id);
  view.setLabels(labelLayer, [...nodeEls.keys()].map(labelItem));
  // Your area: what you've built (plus where you're headed), roomily.
  const target = step ? (step.kind === 'drive' ? step.areas : [step.id]) : [];
  const localBox = () => view.fit(boxOf([...tops, ...target.filter((id) => NODES[id])]), 0.35);
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

  // The stitch: the district's parts start pulled apart (each its own island),
  // slide together, then the seams fade into the one shape, named.
  function stitch(id) {
    const STITCH = 1900;
    const parts = kidsOf(id);
    const [bx, by, bw, bh] = boxOf([id]);
    const [cx, cy] = [bx + bw / 2, by + bh / 2];
    const own = [...nodeEls.keys()].filter((n) => topOf.get(n) === id);
    for (const n of own) nodeEls.get(n).style.visibility = 'hidden';
    pinned = id; // stays whole until the camera has pulled back
    updateShown(view.scale());
    svg.classList.add('stitching');
    const g = svgEl('g', { class: 'ow-stitching' });
    const pieces = parts.map((c) => {
      const [x, y, w, h] = boxOf([c]);
      const [dx, dy] = [x + w / 2 - cx, y + h / 2 - cy];
      const path = svgEl('path', { d: pathOf(c), class: 'ow-stitch-part' });
      path.style.setProperty('--fill', colorIn(c));
      path.style.transform = `translate(${(dx * 0.22).toFixed(1)}px, ${(dy * 0.22).toFixed(1)}px)`;
      g.append(path);
      return path;
    });
    const whole = svgEl('path', { d: pathOf(id), class: 'ow-stitch-whole' });
    whole.style.setProperty('--fill', colorIn(id));
    const name = svgEl('text', { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'ow-stitch-name' });
    name.textContent = labelOf(id);
    g.append(whole, name);
    stitchLayer.append(g);
    sched.after(50, () => {
      const px = view.scale();
      name.style.fontSize = `${(22 / px).toFixed(2)}px`;
      name.style.strokeWidth = `${(6 / px).toFixed(2)}px`;
      g.getBoundingClientRect(); // reflow, so the slide runs
      for (const p of pieces) p.style.transform = 'translate(0px, 0px)';
    });
    sched.after(950, () => g.classList.add('merged'));
    sched.after(STITCH, () => {
      g.remove();
      svg.classList.remove('stitching');
      for (const n of own) nodeEls.get(n).style.visibility = '';
    });
    return STITCH;
  }

  // --- where the camera starts, and what it does ---
  // Resting view: your area. After your very first build, Next pulls all the
  // way out once — there's a lot of LA left — before flying on.
  const arrivingIds = (arriving || []).filter((id) => NODES[id]);
  const firstTime = groups.length === 1 && !book.get('seenWhole');
  const rest = () => (!tops.length ? view.full() : localBox());
  if (!arrivingIds.length || reduceMotion()) {
    view.set(rest());
    if (onward && step) carryOn = sched.after(600, go);
    return;
  }
  view.set(view.fit(boxOf(arrivingIds), 0.06));
  const pullBack = onward && firstTime ? view.full() : rest();
  if (onward && firstTime) book.set('seenWhole', true);
  // Just connected a district? Stitch it: its groups, apart, slide together
  // and merge into one named shape — then the camera pulls back.
  const stitchMs = freshId && NODES[freshId] && !isBottom(freshId) && arrivingIds.includes(freshId) ? stitch(freshId) : 0;
  sched.after(300 + stitchMs, () =>
    view.flyTo(pullBack, onward && firstTime ? 1300 : 1000, () => {
      pinned = null;
      updateShown(view.scale());
      if (onward && step) carryOn = sched.after(firstTime ? 1300 : 700, go);
    }),
  );
}

// For the puzzle screen's tray: "🧩 12 of 69 puzzles rebuilt".
export function campaignLine() {
  const { built: n, total } = progress();
  return `🧩 ${n} of ${total} puzzles rebuilt`;
}
