import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubIndex, lampState } from './scrub.ts';

test('scrubIndex maps a position to the nearest hour, clamped', () => {
  assert.equal(scrubIndex(0, 470, 48), 0);
  assert.equal(scrubIndex(470, 470, 48), 47);
  assert.equal(scrubIndex(-20, 470, 48), 0);
  assert.equal(scrubIndex(9999, 470, 48), 47);
  assert.equal(scrubIndex(235, 470, 48), 24);
});
test('scrubIndex is null with no hours or no width', () => {
  assert.equal(scrubIndex(10, 470, 0), null);
  assert.equal(scrubIndex(10, 0, 48), null);
});
test('scrubIndex with one hour is always 0', () => assert.equal(scrubIndex(300, 470, 1), 0));
test('only fresh or online states pulse', () => {
  assert.equal(lampState('fresh'), 'pulse');
  assert.equal(lampState('online'), 'pulse');
  assert.equal(lampState('stale'), 'dim');
  assert.equal(lampState('nodata'), 'dim');
  assert.equal(lampState('error'), 'dim');
  assert.equal(lampState('checking'), 'steady');
});
