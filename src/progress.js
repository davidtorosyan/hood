// Light progression: how many puzzles you've solved (overall and per region),
// and a shelf of friendly trophies. Nothing here ever takes anything away or
// nags — it just notices what you've done. Trophies are checked whenever
// something worth noticing happens (`record`), and newly earned ones are
// announced with a small toast.
import { NODES, ROOT, childrenOf, pathIds, labelOf } from './jigsaw/tree.js';
import { store } from './store.js';
import { el } from './ui/dom.js';

// Every puzzle in the game: each node with children is one level to assemble.
export const PUZZLES = Object.keys(NODES).filter((id) => NODES[id].children?.length);
export const REGIONS = childrenOf(ROOT);
const regionOf = (id) => pathIds(id)[1] ?? null; // null for the county itself
export const regionPuzzles = (regionId) => PUZZLES.filter((id) => regionOf(id) === regionId);

export function solvedIn(ids) {
  return ids.filter((id) => store.isSolved(id)).length;
}

// "🏆 San Fernando Valley: 3 of 9 puzzles solved" — the solved-board footnote.
export function progressLine(nodeId) {
  const r = regionOf(nodeId);
  if (!r) return `🏆 ${store.solvedCount()} of ${PUZZLES.length} puzzles solved`;
  const ids = regionPuzzles(r);
  return `🏆 ${labelOf(r)}: ${solvedIn(ids)} of ${ids.length} puzzles solved`;
}

// Short, warm names per region for the "every puzzle in X" trophies.
const REGION_TROPHY = {
  'San Fernando Valley': ['🌄', 'Valley Local'],
  'San Gabriel Valley': ['⛰️', 'SGV Insider'],
  'Central L.A.': ['🎬', 'Central Casting'],
  'Westside & Coast': ['🌊', 'Westsider'],
  'South Bay & Harbor': ['⚓', 'Harbor Pilot'],
  'South L.A.': ['🌴', 'South L.A. Proud'],
  'Gateway Cities': ['🚉', 'Gateway Guide'],
};

const half = Math.ceil(PUZZLES.length / 2);

// { id, icon, name, desc, earned() → bool, progress?() → [n, of] }
export const TROPHIES = [
  { id: 'first-piece', icon: '🧩', name: 'First Piece', desc: 'Place your first piece.', earned: () => store.count('placed') >= 1 },
  { id: 'first-map', icon: '🗺️', name: 'Map Maker', desc: 'Solve your first puzzle.', earned: () => store.solvedCount() >= 1 },
  { id: 'county', icon: '🌎', name: 'The Big Picture', desc: 'Solve the whole-county map.', earned: () => store.isSolved(ROOT) },
  {
    id: 'ten', icon: '🔟', name: 'Ten Down', desc: 'Solve 10 puzzles.',
    earned: () => store.solvedCount() >= 10, progress: () => [Math.min(10, store.solvedCount()), 10],
  },
  {
    id: 'half', icon: '🌗', name: 'Halfway There', desc: `Solve ${half} puzzles — half of them all.`,
    earned: () => store.solvedCount() >= half, progress: () => [Math.min(half, store.solvedCount()), half],
  },
  {
    id: 'flawless', icon: '🎯', name: 'Flawless', desc: 'Solve a puzzle of 4+ pieces without a single miss.',
    earned: () => store.flawlessCount() >= 1,
  },
  {
    id: 'sharp', icon: '🦅', name: 'Sharp Eye', desc: 'Solve five different puzzles flawlessly.',
    earned: () => store.flawlessCount() >= 5, progress: () => [Math.min(5, store.flawlessCount()), 5],
  },
  {
    id: 'pieces', icon: '💯', name: 'Hundred Pieces', desc: 'Place 100 pieces.',
    earned: () => store.count('placed') >= 100, progress: () => [Math.min(100, store.count('placed')), 100],
  },
  {
    id: 'curious', icon: '🔎', name: 'Curious', desc: 'Open 10 place cards.',
    earned: () => store.count('cards') >= 10, progress: () => [Math.min(10, store.count('cards')), 10],
  },
  {
    id: 'neighborly', icon: '🏘️', name: 'Good Neighbor', desc: 'Hop next door from a card 5 times.',
    earned: () => store.count('hops') >= 5, progress: () => [Math.min(5, store.count('hops')), 5],
  },
  {
    id: 'explorer', icon: '🧭', name: 'Explorer', desc: 'Visit all 7 regions.',
    earned: () => REGIONS.every((r) => store.visited()[r]),
    progress: () => [REGIONS.filter((r) => store.visited()[r]).length, REGIONS.length],
  },
  ...REGIONS.map((r) => {
    const [icon, name] = REGION_TROPHY[labelOf(r)] || ['🏅', labelOf(r)];
    const ids = regionPuzzles(r);
    return {
      id: `region-${r}`, icon, name, desc: `Solve every puzzle in ${labelOf(r)}${labelOf(r).endsWith('.') ? '' : '.'}`,
      earned: () => solvedIn(ids) === ids.length, progress: () => [solvedIn(ids), ids.length],
    };
  }),
  {
    id: 'all', icon: '👑', name: 'Know-It-All', desc: 'Solve every puzzle in the game.',
    earned: () => store.solvedCount() >= PUZZLES.length, progress: () => [store.solvedCount(), PUZZLES.length],
  },
];

// Something happened: update the tallies, then award (and announce) any trophy
// that's now earned. Events: placed · solved {id, flawless, size} · card · hop ·
// visit {id}.
export function record(event, data = {}) {
  if (event === 'placed') store.bump('placed');
  else if (event === 'card') store.bump('cards');
  else if (event === 'hop') store.bump('hops');
  else if (event === 'solved' && data.flawless && data.size >= 4) store.markFlawless(data.id);
  else if (event === 'visit') {
    const r = regionOf(data.id);
    if (r) store.visit(r);
  }
  const have = store.trophies();
  for (const t of TROPHIES) {
    if (have[t.id] || !t.earned()) continue;
    store.award(t.id);
    announce(t);
  }
}

// Earned trophies that predate this build (e.g. puzzles solved before trophies
// existed) are awarded quietly on load, without a pile of toasts.
export function catchUp() {
  store.prune(new Set(Object.keys(NODES)));
  const have = store.trophies();
  for (const t of TROPHIES) if (!have[t.id] && t.earned()) store.award(t.id);
}

// A small toast at the top of the screen: "🏆 Trophy · Map Maker". Several in a
// row queue up.
let queue = Promise.resolve();
function announce(t) {
  queue = queue.then(
    () =>
      new Promise((done) => {
        const toast = el('div', { class: 'trophy-toast', role: 'status' }, [
          el('span', { class: 'trophy-toast-icon' }, t.icon),
          el('span', { class: 'trophy-toast-text' }, [
            el('span', { class: 'trophy-toast-kicker' }, 'Trophy unlocked'),
            el('b', {}, t.name),
          ]),
        ]);
        document.body.append(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
            toast.remove();
            done();
          }, 300);
        }, 2600);
      }),
  );
}
