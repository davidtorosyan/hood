import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutFor, packTray, VB_W } from '../src/jigsaw/layout.js';

const inside = ([x0, y0, x1, y1]) => x0 >= 0 && y0 >= 0 && x1 <= 1 && y1 <= 1 && x1 > x0 && y1 > y0;

test('portrait phone stacks build over tray, both on the board', () => {
  const l = layoutFor(1565, 2.2);
  assert.equal(l.wide, false);
  assert.ok(inside(l.build) && inside(l.tray));
  assert.ok(l.tray[1] > l.build[3], 'tray sits below the build canvas, with a gap');
});

test('a wide map stacks even on a landscape board', () => {
  assert.equal(layoutFor(560, 2.2, 50).wide, false);
});

test('a tall map on a landscape board goes side by side', () => {
  const l = layoutFor(560, 0.7, 50);
  assert.equal(l.wide, true);
  assert.ok(l.tray[0] > l.build[2]);
});

test('the tray gets room for the pieces', () => {
  for (const [vbH, aspect] of [[1565, 2.2], [1565, 0.7], [1565, 1], [560, 2.2], [560, 0.7]]) {
    const l = layoutFor(vbH, aspect, 60);
    const area = ([x0, y0, x1, y1]) => (x1 - x0) * VB_W * (y1 - y0) * vbH;
    assert.ok(area(l.tray) > 0.25 * area(l.build), `tray too small for ${vbH}/${aspect}`);
  }
});

const ov = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

test('packTray keeps pieces in the tray and labels clear when there is room', () => {
  const tray = [25, 800, 975, 1540];
  const items = [0, 1, 2, 3].map((i) => ({
    box: [100 * i, 100, 100 * i + 120, 200],
    labels: [[100 * i + 20, 140, 100 * i + 100, 160]],
  }));
  let r = 7;
  const rand = () => ((r = (r * 16807) % 2147483647) - 1) / 2147483646;
  const moves = packTray(items, tray, rand);
  const placed = items.map((it, i) => ({
    box: it.box.map((v, k) => v + moves[i][k % 2]),
    label: it.labels[0].map((v, k) => v + moves[i][k % 2]),
  }));
  for (const p of placed) {
    assert.ok(p.box[0] >= tray[0] && p.box[2] <= tray[2] && p.box[1] >= tray[1] && p.box[3] <= tray[3]);
  }
  for (let i = 0; i < placed.length; i++)
    for (let j = 0; j < placed.length; j++)
      if (i !== j) assert.equal(ov(placed[i].label, placed[j].box), 0, 'a label is covered');
});
