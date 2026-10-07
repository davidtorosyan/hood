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

// Built puzzles not yet linked into something bigger: the separate "islands"
// on the overworld. Linking a parent merges its islands into one.
export function topBuilt() {
  return book.doneIds().filter((id) => NODES[id] && built(id) && !built(NODES[id].parent));
}

// How close a bottom puzzle's district is to being linked: built siblings / all.
const parentOf = (id) => NODES[id].parent;
export function districtProgress(id) {
  const sibs = childrenOf(parentOf(id)).filter(hasChildren);
  return { parent: parentOf(id), built: sibs.filter(built).length, total: sibs.length };
}

// What the overworld offers next: any linking puzzles first, then three
// frontier puzzles (or, at the very start, three starting spots). Frontier
// picks favour finishing the district (then the region) you're in — so a "Connect" comes along
// every few builds instead of the map sprawling — plus one wildcard. The offer
// is remembered until you build something, so it doesn't reshuffle on a look.
export function offers(rand = Math.random) {
  const links = linkable();
  const n = book.doneIds().length;
  const saved = book.get('offer');
  const pool = builtLeaves().size ? frontier() : BOTTOM.filter((id) => !built(id));
  if (saved?.at === n && saved.picks.every((id) => pool.includes(id))) return { links, picks: saved.picks };

  const shuffled = pool.map((id) => [id, rand()]).sort((a, b) => a[1] - b[1]).map(([id]) => id);
  // How much of each enclosing area is already built: the district counts
  // most, then the area around it (so after connecting a district, the next
  // offers stay in that region).
  const have = builtLeaves();
  const frac = (a) => leavesOf(a).filter((l) => have.has(l)).length / leavesOf(a).length;
  const score = (id) => {
    const p = parentOf(id);
    const gp = NODES[p].parent;
    return frac(p) + (gp && gp !== ROOT ? 0.5 * frac(gp) : 0);
  };
  const focused = n ? [...shuffled].sort((a, b) => score(b) - score(a)) : shuffled;
  const picks = focused.slice(0, 2);
  const wild = shuffled.find((id) => !picks.includes(id));
  if (wild) picks.push(wild);
  book.set('offer', { at: n, picks });
  return { links, picks };
}

export const progress = () => ({ built: book.doneIds().filter((id) => NODES[id]).length, total: PUZZLES.length });
export const finished = () => built(ROOT);
export const canPlay = (id) => !built(id) && (linkable().includes(id) || offers().picks.includes(id) || frontier().includes(id));
