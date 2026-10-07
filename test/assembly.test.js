import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAnchor, placementOrder, bestMate, dropSnaps, glowStrength, hintLevel, mateRadius } from '../src/jigsaw/assembly.js';

// A small map: a–b–c in a row, d below b.
const graph = { a: ['b'], b: ['a', 'c', 'd'], c: ['b'], d: ['b'] };
const adj = (id) => graph[id] || [];
const ids = Object.keys(graph);

// Deterministic "random" for reproducible tests.
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('every asked-for piece borders something already placed', () => {
  for (let s = 1; s < 50; s++) {
    const rand = seeded(s);
    const anchor = pickAnchor(ids, adj, rand);
    const order = placementOrder(ids, anchor, adj, rand);
    assert.equal(order.length, ids.length - 1);
    assert.ok(!order.includes(anchor));
    const placed = new Set([anchor]);
    for (const id of order) {
      assert.ok(adj(id).some((n) => placed.has(n)), `${id} asked before any neighbour placed`);
      placed.add(id);
    }
  }
});

test('anchor prefers pieces with at least two neighbours', () => {
  for (let s = 1; s < 20; s++) assert.equal(pickAnchor(ids, adj, seeded(s)), 'b');
});

test('a disconnected straggler is still asked for, not dropped', () => {
  const g = { a: ['b'], b: ['a'], z: [] };
  const order = placementOrder(Object.keys(g), 'a', (id) => g[id], seeded(3));
  assert.deepEqual([...order].sort(), ['b', 'z']);
  assert.equal(order.at(-1), 'z');
});

test('snap and glow follow the mate radius', () => {
  const big = { w: 400, h: 300 };
  const small = { w: 60, h: 50 };
  const r = mateRadius(small, big);
  assert.equal(r.snap, 48); // clamped to the minimum
  assert.ok(r.magnet >= r.snap);
  const mate = { id: 'x', ...r };
  assert.ok(dropSnaps(0, 0, mate));
  assert.ok(dropSnaps(r.magnet - 1, 0, mate));
  assert.ok(!dropSnaps(r.magnet + 1, 0, mate));
  assert.ok(!dropSnaps(0, 0, null));
  assert.equal(glowStrength(0, 0, mate), 1);
  assert.equal(glowStrength(r.magnet + 5, 0, mate), 0);
});

test('bestMate picks the placed neighbour with the most forgiving reach', () => {
  const geom = { a: { w: 100, h: 100 }, b: { w: 300, h: 300 }, c: { w: 120, h: 120 }, d: { w: 20, h: 20 } };
  const m = bestMate('b', new Set(['a', 'c', 'd']), adj, (id) => geom[id]);
  assert.equal(m.id, 'c');
  assert.equal(bestMate('a', new Set(['c']), adj, (id) => geom[id]), null);
});

test('hints escalate with misses', () => {
  assert.equal(hintLevel(0), 'none');
  assert.equal(hintLevel(1), 'none');
  assert.equal(hintLevel(2), 'neighbor');
  assert.equal(hintLevel(3), 'ghost');
  assert.equal(hintLevel(9), 'ghost');
});
