// Run with: npm test (node --test, no dependencies). Excluded from `tsc -b`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEG, DESCENT, descentPose, idlePose, reticleScale } from './globeMath.ts';

const frame = { site: { lat: 28.478, lon: 76.904 }, near: 4.4, far: 11.7 };

test('descentPose: d = 0 is the base pose exactly', () => {
  const base = idlePose(12.3, frame);
  assert.deepEqual(descentPose(base, 0, frame), base);
});

test('descentPose: d = 1 puts the camera at DESCENT.close straight above the site', () => {
  const pose = descentPose(idlePose(12.3, frame), 1, frame);
  assert.ok(Math.abs(pose.distance - DESCENT.close) < 1e-9);
  assert.ok(Math.abs(pose.elevation - frame.site.lat * DEG) < 1e-9);
  assert.ok(Math.abs(pose.spin + frame.site.lon * DEG) < 1e-9);
  assert.equal(pose.lock, 1);
  assert.equal(pose.roll, 0);
});

test('descentPose: the camera distance falls monotonically with the descent', () => {
  const base = idlePose(0, frame);
  let previous = Number.POSITIVE_INFINITY;
  for (let d = 0; d <= 1.0001; d += 0.05) {
    const { distance } = descentPose(base, d, frame);
    assert.ok(distance <= previous + 1e-12, `distance at d=${d.toFixed(2)}`);
    previous = distance;
  }
});

test('reticleScale: 1 at rest, smaller when close, never below 0.4', () => {
  assert.equal(reticleScale(frame.near, frame.near), 1);
  assert.ok(reticleScale(DESCENT.close, frame.near) < 1);
  assert.equal(reticleScale(1, frame.near), 0.4);
});
