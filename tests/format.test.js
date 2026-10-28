import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatElapsed, progressRatio } from '../js/format.js';

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

test('progressRatio is current / duration, clamped to 0..1', () => {
  assert.equal(progressRatio(30, 120), 0.25);
  assert.equal(progressRatio(130, 120), 1);
  assert.equal(progressRatio(-1, 120), 0);
});

test('progressRatio is 0 while the duration is unknown', () => {
  assert.equal(progressRatio(5, NaN), 0);
  assert.equal(progressRatio(5, 0), 0);
  assert.equal(progressRatio(5, Infinity), 0);
});
