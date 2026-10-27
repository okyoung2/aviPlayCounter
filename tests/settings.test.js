import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCustomCount, resolveSettings, targetOf, DEFAULT_SETTINGS, PRESETS, CORNERS } from '../js/settings.js';

test('constants match the spec', () => {
  assert.deepEqual(PRESETS, [3, 9, 11, 27, 54, 108]);
  assert.deepEqual(CORNERS, ['top-left', 'top-right', 'bottom-left', 'bottom-right']);
  assert.deepEqual(DEFAULT_SETTINGS, { count: 108, corner: 'top-right', lastAlert: true, doneAlert: true });
});

test('parseCustomCount', () => {
  assert.equal(parseCustomCount('7'), 7);
  assert.equal(parseCustomCount(' 12 '), 12);
  assert.equal(parseCustomCount('9999'), 9999);
  for (const bad of ['', '0', '-3', '2.5', 'abc', '10000', '1e3']) assert.equal(parseCustomCount(bad), null);
});

test('resolveSettings prefers item, then last used, then defaults', () => {
  const item = { count: 9, corner: 'bottom-left', lastAlert: false, doneAlert: true };
  const last = { count: 27, corner: 'top-left', lastAlert: true, doneAlert: false };
  assert.deepEqual(resolveSettings(item, last), item);
  assert.deepEqual(resolveSettings(null, last), last);
  assert.deepEqual(resolveSettings(null, null), DEFAULT_SETTINGS);
  assert.deepEqual(resolveSettings({ count: null }, null), { ...DEFAULT_SETTINGS, count: null });
});

test('targetOf maps null to Infinity', () => {
  assert.equal(targetOf({ ...DEFAULT_SETTINGS, count: null }), Infinity);
  assert.equal(targetOf(DEFAULT_SETTINGS), 108);
});
