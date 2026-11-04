// Run with: node --test src/shell/useViewRoute.test.ts (no dependencies). Excluded from `tsc -b`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseViewHash } from './useViewRoute.ts';

const IDS = ['overview', 'air-quality', 'station', 'aeios'] as const;
type Id = (typeof IDS)[number];
const ALIASES: Record<string, Id> = { 'pm-forecast': 'aeios' };
const parse = (hash: string) => parseViewHash<Id>(hash, IDS, 'overview', ALIASES);

test('a canonical route opens its view and needs no rewrite', () => {
  assert.deepEqual(parse('#/station'), { view: 'station', canonical: true });
  assert.deepEqual(parse('#/air-quality'), { view: 'air-quality', canonical: true });
});

test('no fragment is the landing view, and the address bar is left alone', () => {
  assert.deepEqual(parse(''), { view: 'overview', canonical: true });
  assert.deepEqual(parse('#'), { view: 'overview', canonical: true });
});

test('a legacy section anchor opens the view and is rewritten to the canonical route', () => {
  assert.deepEqual(parse('#station'), { view: 'station', canonical: false });
});

test('an alias opens the view that holds the section', () => {
  assert.deepEqual(parse('#pm-forecast'), { view: 'aeios', canonical: false });
  assert.deepEqual(parse('#/pm-forecast'), { view: 'aeios', canonical: false });
});

test('an unknown route falls back to the landing view (and is rewritten)', () => {
  assert.deepEqual(parse('#/nope'), { view: 'overview', canonical: false });
  assert.deepEqual(parse('#/'), { view: 'overview', canonical: false });
});

test('a trailing slash and percent-encoding are tolerated', () => {
  assert.deepEqual(parse('#/station/'), { view: 'station', canonical: false });
  assert.deepEqual(parse('#/air%2Dquality'), { view: 'air-quality', canonical: false });
});

test('a fragment that is not a route (the skip link target) never changes the view', () => {
  assert.deepEqual(parse('#main-content'), { fragment: 'main-content' });
});
