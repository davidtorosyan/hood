// Integrity of the generated puzzle data (what build:shapes produces).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLACES } from '../src/data/places.js';

const { nodes, root } = JSON.parse(readFileSync('src/data/hierarchy.json', 'utf8'));
const adjacency = JSON.parse(readFileSync('src/data/puzzle-adjacency.json', 'utf8'));
const shapes = JSON.parse(readFileSync('src/data/puzzle-shapes.json', 'utf8'));
const groups = Object.entries(nodes).filter(([, n]) => n.children?.length);

test('every puzzle has 2–7 pieces', () => {
  for (const [id, n] of groups) assert.ok(n.children.length >= 2 && n.children.length <= 7, `${id}: ${n.children.length}`);
});

test("every puzzle's pieces form one connected group (so guided order always works)", () => {
  for (const [id, n] of groups) {
    const kids = new Set(n.children);
    const seen = new Set([n.children[0]]);
    const stack = [n.children[0]];
    while (stack.length) for (const x of adjacency[stack.pop()] || []) if (kids.has(x) && !seen.has(x)) seen.add(x), stack.push(x);
    assert.equal(seen.size, kids.size, `${id} is disconnected`);
  }
});

test('adjacency is symmetric and between siblings', () => {
  for (const [a, list] of Object.entries(adjacency)) {
    for (const b of list) {
      assert.ok(adjacency[b]?.includes(a), `${a}→${b} not mirrored`);
      assert.equal(nodes[a].parent, nodes[b].parent);
    }
  }
});

test('every node has a shape, and every place has card info', () => {
  for (const id of Object.keys(nodes)) if (id !== root) assert.ok(shapes[id]?.length >= 4, `no shape for ${id}`);
  for (const [id, n] of Object.entries(nodes)) {
    if (n.children?.length) continue;
    assert.ok(PLACES[n.label], `no PLACES entry for ${n.label}`);
  }
});

test('sibling names are unique', () => {
  for (const [id, n] of groups) {
    const kidLabels = n.children.map((c) => nodes[c].label);
    assert.equal(new Set(kidLabels).size, kidLabels.length, `duplicate names under ${id}`);
  }
});
