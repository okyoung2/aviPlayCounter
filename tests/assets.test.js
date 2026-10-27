import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWav, makePng } from '../tools/make-assets.mjs';

test('makeWav writes a valid 16-bit mono RIFF header', () => {
  const buf = makeWav(new Float32Array(44100), 44100);
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  assert.equal(buf.readUInt16LE(22), 1);
  assert.equal(buf.readUInt32LE(24), 44100);
  assert.equal(buf.readUInt16LE(34), 16);
  assert.equal(buf.length, 44 + 44100 * 2);
});

test('makePng writes a PNG of the requested size', () => {
  const png = makePng(192);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 192);
  assert.equal(png.readUInt32BE(20), 192);
});
