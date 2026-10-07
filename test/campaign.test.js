// "Rebuild LA" can always be finished: from ANY starting spot, growing
// outward (bottom puzzles that border what's built) and linking (a puzzle
// once everything inside it is built) eventually rebuilds the county.
// Mirrors the rules in src/campaign/state.js over the generated data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { nodes, root } = JSON.parse(readFileSync('src/data/hierarchy.json', 'utf8'));
const neighbors = JSON.parse(readFileSync('src/data/neighbors.json', 'utf8'));
const kids = (id) => nodes[id]?.children || [];
const isPuzzle = (id) => kids(id).length > 0;
const leaves = (id) => (isPuzzle(id) ? kids(id).flatMap(leaves) : [id]);
const PUZZLES = Object.keys(nodes).filter(isPuzzle);
const BOTTOM = PUZZLES.filter((id) => kids(id).every((c) => !isPuzzle(c)));

test('the campaign can be finished from every starting spot', () => {
  for (const start of BOTTOM) {
    const built = new Set([start]);
    const have = new Set(leaves(start));
    for (let progressed = true; progressed; ) {
      progressed = false;
      for (const id of PUZZLES) {
        if (built.has(id)) continue;
        const ok = BOTTOM.includes(id)
          ? leaves(id).some((l) => (neighbors[l] || []).some((n) => have.has(n)))
          : kids(id).filter(isPuzzle).every((c) => built.has(c));
        if (!ok) continue;
        built.add(id);
        for (const l of leaves(id)) have.add(l);
        progressed = true;
      }
    }
    assert.ok(built.has(root), `starting at ${start}: stuck at ${built.size} of ${PUZZLES.length}`);
  }
});
