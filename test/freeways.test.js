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

test('there are freeway puzzles, starting with 2-leg drives to learn on', () => {
  assert.ok(puzzles.length >= 70);
  for (let i = 0; i < 8; i++) assert.equal(puzzles[i].blocks.length, 2);
  assert.ok(puzzles.filter((p) => p.blocks.length >= 3).length >= 20);
});

test('every drive joins two real places with 2–4 freeways', () => {
  const pairs = new Set();
  for (const p of puzzles) {
    const name = `${p.from} → ${p.to}`;
    assert.ok(nodes[p.from] && nodes[p.to], `${name}: unknown place`);
    assert.ok(!nodes[p.from].children && !nodes[p.to].children, `${name}: ends must be places`);
    assert.ok(p.blocks.length >= 2 && p.blocks.length <= 4, `${name}: ${p.blocks.length} blocks`);
    assert.ok(!p.decoys, `${name}: no decoys (Dave: confusing, little gain)`);
    const onRoute = new Set(p.blocks.map((b) => b.ref));
    assert.equal(onRoute.size, p.blocks.length, `${name}: a freeway repeats`);
    for (const b of p.blocks) assert.ok(refs[b.ref], `${name}: unknown freeway ${b.ref}`);
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
import { nextIndex, tierOf, nextLeg, drivable, nearestOnLine, pull, placeHint, compass, acceptFor, ROADS_DRIVES } from '../src/freeways/rules.js';

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

test('nearest point on a road', () => {
  const road = [[0, 0], [100, 0], [100, 100]];
  const a = nearestOnLine([50, 30], road);
  assert.equal(a.d, 30);
  assert.deepEqual(a.point, [50, 0]);
  assert.equal(nearestOnLine([130, 50], road).d, 30);
});

test('magnetism pulls a held shape in near its spot, never jumps at the edge', () => {
  assert.deepEqual(pull(300, 0, 170), [300, 0]);
  assert.ok(Math.abs(pull(169.9, 0, 170)[0] - 169.9) < 1);
  const [close] = pull(40, 0, 170);
  assert.ok(close < 40 && close > 0);
});

test('help escalates one step per miss; early drives draw the roads', () => {
  assert.deepEqual([0, 1, 2, 3, 6].map(placeHint), [null, 'dir', 'via', 'ghost', 'ghost']);
  assert.equal(tierOf(0), 'roads');
  assert.equal(tierOf(ROADS_DRIVES), 'blind');
  assert.ok(acceptFor(0) > acceptFor(10) && acceptFor(10) > acceptFor(40));
  assert.equal(compass([0, 0], [10, 0]), 'east');
  assert.equal(compass([0, 0], [10, -10]), 'northeast');
  assert.equal(compass([0, 0], [0, 10]), 'south');
});

test('no stub legs: every leg is a real stretch of freeway', () => {
  for (const p of puzzles) {
    for (const b of p.blocks) {
      const pts = decodeRing(b.line);
      const len = pts.slice(1).reduce((s, q, i) => s + km(pts[i], q), 0);
      assert.ok(len > 3.5, `${p.from} → ${p.to}: the ${b.ref} leg is only ${len.toFixed(1)} km`);
    }
  }
});

import { arrowsFor, dirName } from '../src/freeways/rules.js';

test('legs become chained grid arrows in 8 directions', () => {
  // 10 km south, then 20 km west.
  const a = arrowsFor([[[0, 0], [0, 10]], [[0, 10], [-20, 10]]], 6);
  assert.deepEqual(a[0].dir, [0, 1]);
  assert.deepEqual(a[1].dir, [-1, 0]);
  assert.ok(a[1].len > a[0].len); // relative distances survive
  assert.deepEqual(a[1].from, a[0].to); // chained
  assert.equal(dirName(a[0].dir), 'south');
  // A diagonal leg snaps to a diagonal arrow.
  assert.deepEqual(arrowsFor([[[0, 0], [10, -9]]])[0].dir, [1, -1]);
});

test('every drive makes a sensible arrow puzzle', () => {
  const kx = 111.32 * Math.cos((34 * Math.PI) / 180);
  for (const p of puzzles) {
    const legs = p.blocks.map((b) => {
      const l = decodeRing(b.line);
      const [a, z] = [l[0], l.at(-1)];
      return [[a[0] * kx, -a[1] * 110.57], [z[0] * kx, -z[1] * 110.57]];
    });
    const arrows = arrowsFor(legs, 6);
    for (const x of arrows) assert.ok(x.len >= 1 && x.len <= 8, `${p.from} → ${p.to}: arrow of ${x.len}`);
    const end = arrows.at(-1).to;
    assert.ok(end[0] || end[1], `${p.from} → ${p.to}: ends where it starts`);
  }
});
