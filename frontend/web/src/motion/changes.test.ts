// Run with: npm test (node --test, no dependencies). Excluded from `tsc -b`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { alertChange, changedStates, contextKey, newPackets } from './changes.ts';

test('newPackets: a new object with the same rx_utc is NOT a new packet', () => {
  const a = { N1: '2026-11-01T10:00:00Z', N2: null };
  assert.deepEqual(newPackets(a, { ...a }), []);
  assert.deepEqual(newPackets(a, { N1: '2026-11-01T10:01:00Z', N2: null }), ['N1']);
});

test('newPackets: no signal on first snapshot, for nodes appearing, or for a node losing its packet', () => {
  assert.deepEqual(newPackets(null, { N1: 'x' }), []);
  assert.deepEqual(newPackets({ N1: 'x' }, { N1: 'x', N3: 'y' }), []);
  assert.deepEqual(newPackets({ N1: 'x' }, { N1: null }), []);
});

test('changedStates: only real transitions', () => {
  assert.deepEqual(changedStates(null, { N1: 'fresh' }), []);
  assert.deepEqual(changedStates({ N1: 'fresh', gw: 'online' }, { N1: 'fresh', gw: 'online' }), []);
  assert.deepEqual(changedStates({ N1: 'fresh' }, { N1: 'stale' }), [{ key: 'N1', from: 'fresh', to: 'stale' }]);
});

test('alertChange: raised, cleared, and no signal for repeats, loading or errors', () => {
  assert.equal(alertChange(null, { kind: 'active', id: 1 }), null);
  assert.equal(alertChange({ kind: 'none', id: null }, { kind: 'active', id: 1 }), 'raised');
  assert.equal(alertChange({ kind: 'active', id: 1 }, { kind: 'active', id: 1 }), null);
  assert.equal(alertChange({ kind: 'active', id: 1 }, { kind: 'active', id: 2 }), 'raised');
  assert.equal(alertChange({ kind: 'active', id: 1 }, { kind: 'none', id: null }), 'cleared');
  assert.equal(alertChange({ kind: 'active', id: 1 }, { kind: 'cannot-assess', id: null }), 'cleared');
  assert.equal(alertChange({ kind: 'active', id: 1 }, { kind: 'error', id: null }), null);
  assert.equal(alertChange({ kind: 'loading', id: null }, { kind: 'active', id: 1 }), null);
});

test('contextKey changes on site or fixture switch', () => {
  assert.notEqual(contextKey('sgt', null), contextKey('chandu', null));
  assert.notEqual(contextKey('sgt', null), contextKey('sgt', 'stale'));
});
