import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRing, decodeRing } from '../src/jigsaw/polyline.js';

test('polyline round-trips 5-decimal LA coordinates exactly', () => {
  const ring = [[-118.66741, 34.17675], [-118.65859, 34.17675], [-118.0, 33.70001], [-118.66741, 34.17675]];
  assert.deepEqual(decodeRing(encodeRing(ring)), ring);
});

test('the classic Google example decodes', () => {
  // From Google's polyline docs: (38.5,-120.2), (40.7,-120.95), (43.252,-126.453)
  assert.deepEqual(decodeRing('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
});
