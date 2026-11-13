import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldBoot, BOOT_SESSION_KEY } from './boot.ts';

test('boot plays only the first time in a session, and not under reduced motion', () => {
  assert.equal(shouldBoot(false, false), true);
  assert.equal(shouldBoot(true, false), false);
  assert.equal(shouldBoot(false, true), false);
});
test('the session key is namespaced', () => assert.match(BOOT_SESSION_KEY, /^aeios:/));
