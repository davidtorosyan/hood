// Rebuild LA's journey (src/campaign/chapters.js): every step is a real
// puzzle, things are built before they're connected or driven between, and
// the drives start with one arrow and grow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAPTERS, driveKey } from '../src/campaign/chapters.js';

const { nodes } = JSON.parse(readFileSync('src/data/hierarchy.json', 'utf8'));
const { campaign } = JSON.parse(readFileSync('src/data/freeways.json', 'utf8'));
const kids = (id) => nodes[id]?.children || [];
const leaves = (id) => (kids(id).length ? kids(id).flatMap(leaves) : [id]);
const steps = CHAPTERS.flatMap((c) => c.steps);

test('every step names a real puzzle, built before it is linked or driven to', () => {
  const built = new Set();
  for (const [kind, a, b] of steps) {
    if (kind === 'build') {
      assert.ok(kids(a).length && kids(a).every((c) => !kids(c).length), `${a}: not a bottom puzzle`);
      built.add(a);
    } else if (kind === 'link') {
      assert.ok(kids(a).every((c) => !kids(c).length || built.has(c)), `${a}: linked before its pieces are built`);
      built.add(a);
    } else {
      assert.equal(kind, 'drive');
      assert.ok(built.has(a) && built.has(b), `drive ${a} ⇒ ${b}: an end isn't built yet`);
    }
  }
});

test('each drive runs between its two areas, starting with one arrow', () => {
  const drives = steps.filter(([k]) => k === 'drive');
  assert.ok(drives.length >= 2);
  drives.forEach(([, a, b], i) => {
    const d = campaign[driveKey(a, b)];
    assert.ok(d, `no drive data for ${a} ⇒ ${b} (run npm run build:freeways)`);
    assert.ok(leaves(a).includes(d.from) && leaves(b).includes(d.to), `${d.from} → ${d.to} isn't between ${a} and ${b}`);
    if (i === 0) assert.equal(d.blocks.length, 1, 'the first drive is the one-arrow tutorial');
  });
  const most = Math.max(...drives.map(([, a, b]) => campaign[driveKey(a, b)].blocks.length));
  assert.ok(most >= 2, 'the journey gets to a drive with more than one arrow');
});
