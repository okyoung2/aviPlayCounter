import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCounter } from '../js/counter.js';

test('target 3: counts rounds and flags the last round start', () => {
  const c = createCounter(3);
  assert.deepEqual(c.start(), { action: 'play', lastRound: false, complete: false });
  assert.equal(c.current, 1);
  assert.deepEqual(c.trackEnded(), { action: 'play', lastRound: false, complete: false });
  assert.deepEqual(c.trackEnded(), { action: 'play', lastRound: true, complete: false });
  assert.equal(c.current, 3);
  assert.deepEqual(c.trackEnded(), { action: 'finish', lastRound: false, complete: true });
  assert.equal(c.completed, 3);
  assert.equal(c.finished, true);
});

test('target 1: first round is the last round', () => {
  assert.deepEqual(createCounter(1).start(), { action: 'play', lastRound: true, complete: false });
});

test('infinite: never last round, never finishes', () => {
  const c = createCounter(Infinity);
  c.start();
  for (let i = 0; i < 500; i++) {
    assert.deepEqual(c.trackEnded(), { action: 'play', lastRound: false, complete: false });
  }
  assert.equal(c.completed, 500);
  assert.equal(c.current, 501);
});

test('ended after finish is a no-op', () => {
  const c = createCounter(1);
  c.start();
  c.trackEnded();
  assert.deepEqual(c.trackEnded(), { action: 'finish', lastRound: false, complete: false });
  assert.equal(c.completed, 1);
});

test('rejects invalid targets', () => {
  for (const t of [0, -1, 2.5, NaN]) assert.throws(() => createCounter(t));
});
