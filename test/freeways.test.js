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
