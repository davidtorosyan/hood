import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapLabel, layoutLabels, labelBoxes } from '../src/jigsaw/labels.js';

test('wrapLabel balances two lines', () => {
  assert.deepEqual(wrapLabel('Burbank'), ['Burbank']);
  assert.deepEqual(wrapLabel('San Fernando Valley'), ['San Fernando', 'Valley']);
  assert.deepEqual(wrapLabel('South Bay & Harbor'), ['South Bay', '& Harbor']);
});

const ov = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

test('colliding labels slide to another anchor', () => {
  const items = [
    { id: 'a', label: 'Westside', geom: { w: 300, h: 200, anchors: [[100, 100], [100, 250]] } },
    { id: 'b', label: 'Central', geom: { w: 100, h: 100, anchors: [[120, 100]] } },
  ];
  const plans = layoutLabels(items, 30);
  const box = (id) => labelBoxes(plans.get(id).lines, 30, plans.get(id).x, plans.get(id).y)[0];
  assert.equal(ov(box('a'), box('b')), 0);
  assert.deepEqual([plans.get('b').x, plans.get('b').y], [120, 100], 'the small piece keeps its best spot');
});
