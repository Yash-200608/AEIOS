import test from 'node:test';
import assert from 'node:assert/strict';
import { countFrame, decodeFrame } from './motionMath.ts';

test('countFrame ends exactly on the target', () => {
  assert.equal(countFrame(10, 153, 0), 10);
  assert.equal(countFrame(10, 153, 1), 153);
  assert.equal(countFrame(10, 153, 2), 153);
});
test('countFrame is monotonic', () => assert.ok(countFrame(0, 100, 0.5) > countFrame(0, 100, 0.25)));
test('decodeFrame keeps length and spaces, and ends on the target', () => {
  const r = () => 0.5;
  assert.equal(decodeFrame('Poor dispersion', 0, r).length, 15);
  assert.equal(decodeFrame('Poor dispersion', 0, r)[4], ' ');
  assert.equal(decodeFrame('Poor dispersion', 1, r), 'Poor dispersion');
  assert.ok(decodeFrame('Poor dispersion', 0.5, r).startsWith('Poor di'));
});
