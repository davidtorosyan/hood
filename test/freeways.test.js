// The Freeways puzzles (src/data/freeways.json, from build-freeways.mjs):
// real places, a drive that's continuous from one place to the other, and
// decoys that really aren't on the route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeRing } from '../src/jigsaw/polyline.js';

const { nodes } = JSON.parse(readFileSync('src/data/hierarchy.json', 'utf8'));
const { refs, puzzles } = JSON.parse(readFileSync('src/data/freeways.json', 'utf8'));
const km = ([a, b], [c, d]) => Math.hypot((a - c) * 92.3, (b - d) * 110.6);

test('there are freeway puzzles, easier first', () => {
  assert.ok(puzzles.length >= 40);
  for (let i = 1; i < puzzles.length; i++) assert.ok(puzzles[i].blocks.length >= puzzles[i - 1].blocks.length);
});

test('every drive joins two real places with 2–4 freeways and a decoy', () => {
  const pairs = new Set();
  for (const p of puzzles) {
    const name = `${p.from} → ${p.to}`;
    assert.ok(nodes[p.from] && nodes[p.to], `${name}: unknown place`);
    assert.ok(!nodes[p.from].children && !nodes[p.to].children, `${name}: ends must be places`);
    assert.ok(p.blocks.length >= 2 && p.blocks.length <= 4, `${name}: ${p.blocks.length} blocks`);
    assert.ok(p.decoys.length >= 1, `${name}: no decoy`);
    const onRoute = new Set(p.blocks.map((b) => b.ref));
    assert.equal(onRoute.size, p.blocks.length, `${name}: a freeway repeats`);
    for (const b of [...p.blocks, ...p.decoys]) assert.ok(refs[b.ref], `${name}: unknown freeway ${b.ref}`);
    for (const d of p.decoys) assert.ok(!onRoute.has(d.ref), `${name}: decoy ${d.ref} is on the route`);
    assert.ok(!pairs.has(name), `${name}: duplicate`);
    pairs.add(name);
  }
});

test('each drive is continuous: one freeway ends where the next begins', () => {
  for (const p of puzzles) {
    const lines = p.blocks.map((b) => decodeRing(b.line));
    for (let i = 1; i < lines.length; i++) {
      const gap = km(lines[i - 1].at(-1), lines[i][0]);
      assert.ok(gap < 0.5, `${p.from} → ${p.to}: ${gap.toFixed(2)} km gap between the ${p.blocks[i - 1].ref} and the ${p.blocks[i].ref}`);
    }
  }
});

// --- the pure rules ---
import { nextIndex, tierOf, nextLeg, drivable, pull, near, legHint, GUIDED_DRIVES } from '../src/freeways/rules.js';

test('next drive: first unsolved after the current one, wrapping', () => {
  const solved = new Set(['b', 'c']);
  const ids = ['a', 'b', 'c', 'd'];
  const next = (from) => nextIndex((id) => solved.has(id), from, ids.length, (i) => ids[i]);
  assert.equal(next(-1), 0);
  assert.equal(next(0), 3);
  assert.equal(next(3), 0);
});

test('legs go in driving order; the car drives only a placed run from the start', () => {
  assert.equal(nextLeg(new Set(), 3), 0);
  assert.equal(nextLeg(new Set([0, 2]), 3), 1);
  assert.equal(drivable(new Set([1, 2]), 3), 0);
  assert.equal(drivable(new Set([0, 1, 2]), 3), 3);
});

test('magnetism pulls in near the spot, never jumps at the edge', () => {
  assert.deepEqual(pull(300, 0, 150), [300, 0]);
  const [edge] = pull(149.9, 0, 150);
  assert.ok(Math.abs(edge - 149.9) < 1);
  const [close] = pull(30, 0, 150);
  assert.ok(close < 30 && close > 0);
  assert.ok(near(100, 0, 150) && !near(200, 0, 150));
});

test('help escalates one step per miss; early drives are guided', () => {
  assert.deepEqual([0, 1, 2, 3, 7].map(legHint), [null, 'via', 'slot', 'name', 'name']);
  assert.equal(tierOf(0), 'guided');
  assert.equal(tierOf(GUIDED_DRIVES), 'open');
});
