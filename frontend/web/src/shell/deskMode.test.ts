import test from 'node:test';
import assert from 'node:assert/strict';
import { deskMode } from './deskMode.ts';

test('blocked under 1024', () => assert.equal(deskMode(1023).mode, 'blocked'));
test('scaled from 1024 to 1279', () => {
  assert.deepEqual(deskMode(1024), { mode: 'scaled', scale: 0.8 });
  assert.equal(deskMode(1279).mode, 'scaled');
});
test('full from 1280', () => assert.deepEqual(deskMode(1280), { mode: 'full', scale: 1 }));
