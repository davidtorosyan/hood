// "Rebuild LA" — the campaign's rules, over its own ledger (store.campaign).
//
// LA has been scrambled; you rebuild it BOTTOM-UP. The smallest puzzles (a
// group whose pieces are all individual places) are "bottom" puzzles; every
// other puzzle "links" pieces you've already built. You can build:
//   - a bottom puzzle on the FRONTIER — one with a place bordering something
//     you've already built (so the map grows outward, connected), or, before
//     anything is built, one of three offered starting spots;
//   - a linking puzzle once every puzzle inside it is built.
// Building the county itself, last, puts LA back together.
import { NODES, ROOT, childrenOf, hasChildren, leavesOf } from '../jigsaw/tree.js';
import NEIGHBORS from '../data/neighbors.json';
import { store } from '../store.js';

const book = store.campaign;
export const PUZZLES = Object.keys(NODES).filter((id) => hasChildren(id));
const BOTTOM = PUZZLES.filter((id) => childrenOf(id).every((c) => !hasChildren(c)));
export const isBottom = (id) => BOTTOM.includes(id);
export const built = (id) => !!book.progress(id);

// Every place inside a built puzzle.
export function builtLeaves() {
  const out = new Set();
  for (const id of book.doneIds()) if (NODES[id]) for (const l of leavesOf(id)) out.add(l);
  return out;
}

// Bottom puzzles you can build now (bordering what's built).
export function frontier() {
  const have = builtLeaves();
  if (!have.size) return [];
  return BOTTOM.filter((id) => !built(id) && leavesOf(id).some((l) => (NEIGHBORS[l] || []).some((n) => have.has(n))));
}

// Linking puzzles you can build now (everything inside them is built).
export function linkable() {
  return PUZZLES.filter(
    (id) => !isBottom(id) && !built(id) && childrenOf(id).filter(hasChildren).every(built),
  );
}

// What the overworld offers next: any linking puzzles first, then up to three
// frontier puzzles (or, at the very start, three starting spots). The offer is
// remembered, so it doesn't reshuffle every time you look — it refreshes once
// one of them is built.
export function offers(rand = Math.random) {
  const links = linkable();
  const pool = builtLeaves().size ? frontier() : BOTTOM.filter((id) => !built(id));
  let picks = (book.get('offer') || []).filter((id) => pool.includes(id));
  if (picks.length < Math.min(3, pool.length)) {
    const rest = pool.filter((id) => !picks.includes(id));
    while (picks.length < 3 && rest.length) picks.push(rest.splice(Math.floor(rand() * rest.length), 1)[0]);
    book.set('offer', picks);
  }
  return { links, picks };
}

export const progress = () => ({ built: book.doneIds().filter((id) => NODES[id]).length, total: PUZZLES.length });
export const finished = () => built(ROOT);
export const canPlay = (id) => !built(id) && (linkable().includes(id) || offers().picks.includes(id) || frontier().includes(id));
