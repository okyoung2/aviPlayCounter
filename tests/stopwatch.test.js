import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStopwatch } from '../js/stopwatch.js';

test('counts only while running', () => {
  let t = 1000;
  const sw = createStopwatch(() => t);
  sw.start(); t = 4000;
  assert.equal(sw.elapsedMs(), 3000);
  sw.pause(); t = 10_000;
  assert.equal(sw.elapsedMs(), 3000);
  sw.resume(); t = 11_000;
  assert.equal(sw.elapsedMs(), 4000);
});

test('pause and resume are idempotent', () => {
  let t = 0;
  const sw = createStopwatch(() => t);
  sw.start(); t = 1000;
  sw.pause(); sw.pause(); t = 5000;
  sw.resume(); sw.resume(); t = 6000;
  assert.equal(sw.elapsedMs(), 2000);
});

test('elapsed is 0 before start', () => {
  assert.equal(createStopwatch(() => 50).elapsedMs(), 0);
});
