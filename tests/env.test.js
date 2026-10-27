import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeDesktopMode } from '../js/env.js';

test('touch phone laid out at desktop width is desktop mode', () => {
  assert.equal(looksLikeDesktopMode({ innerWidth: 980, screenWidth: 384, coarsePointer: true }), true);
});

test('touch phone at its own width is not desktop mode', () => {
  assert.equal(looksLikeDesktopMode({ innerWidth: 384, screenWidth: 384, coarsePointer: true }), false);
  assert.equal(looksLikeDesktopMode({ innerWidth: 846, screenWidth: 846, coarsePointer: true }), false); // 가로 화면
});

test('real desktop with a mouse is never flagged', () => {
  assert.equal(looksLikeDesktopMode({ innerWidth: 1372, screenWidth: 1920, coarsePointer: false }), false);
  assert.equal(looksLikeDesktopMode({ innerWidth: 1372, screenWidth: 900, coarsePointer: false }), false);
});
