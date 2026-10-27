import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatElapsed } from '../js/format.js';

test('formats under an hour as mm:ss', () => {
  assert.equal(formatElapsed(0), '00:00');
  assert.equal(formatElapsed(61_000), '01:01');
  assert.equal(formatElapsed(59_999), '00:59');
  assert.equal(formatElapsed(3_599_000), '59:59');
});

test('formats an hour or more as h:mm:ss', () => {
  assert.equal(formatElapsed(3_600_000), '1:00:00');
  assert.equal(formatElapsed(3_725_000), '1:02:05');
});
