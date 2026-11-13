import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestHourIndex } from './hours.ts';

const times = ['2026-11-13T09:00', '2026-11-13T10:00', '2026-11-13T11:00', '2026-11-13T12:00'];

test('picks the nearest slot', () => {
  assert.equal(nearestHourIndex(times, '2026-11-13T10:10'), 1);
  assert.equal(nearestHourIndex(times, '2026-11-13T10:45'), 2);
});
test('a quarter-hour current time before :30 keeps the earlier slot (the dashboard shows that hour)', () => {
  assert.equal(nearestHourIndex(times, '2026-11-13T10:15'), 1);
});
test('a tie keeps the earlier slot', () => assert.equal(nearestHourIndex(times, '2026-11-13T10:30'), 1));
test('unparseable time or no slots gives 0', () => {
  assert.equal(nearestHourIndex(times, 'nope'), 0);
  assert.equal(nearestHourIndex([], '2026-11-13T10:00'), 0);
});
