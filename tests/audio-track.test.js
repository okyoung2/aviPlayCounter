import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { stripVideoTracks } from '../js/audio-track.js';

const fixture = async (name, type = 'video/mp4') =>
  new Blob([await readFile(new URL(`./fixtures/${name}`, import.meta.url))], { type });

// ffprobe 가 있으면 실제로 어떤 트랙이 남았는지 확인한다.
function streamTypes(bytes) {
  try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { return null; }
  return (async () => {
    const dir = await mkdtemp(join(tmpdir(), 'strip-'));
    const path = join(dir, 'out.m4a');
    await writeFile(path, bytes);
    return execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path])
      .toString().trim().split(/\s+/);
  })();
}

for (const name of ['clip.mp4', 'clip-faststart.mp4']) {
  test(`${name}: video track removed, audio kept, size unchanged`, async () => {
    const input = await fixture(name);
    const out = await stripVideoTracks(input);
    assert.ok(out instanceof Blob);
    assert.equal(out.size, input.size);
    assert.equal(out.type, 'audio/mp4');
    const bytes = Buffer.from(await out.arrayBuffer());
    const types = await streamTypes(bytes);
    if (types) assert.deepEqual(types, ['audio']);
  });
}

test('fragmented mp4 is left alone (null)', async () => {
  assert.equal(await stripVideoTracks(await fixture('clip-fragmented.mp4')), null);
});

test('non-mp4 input returns null', async () => {
  assert.equal(await stripVideoTracks(await fixture('tick.wav', 'audio/wav')), null);
  assert.equal(await stripVideoTracks(new Blob([new Uint8Array(1000)])), null);
  assert.equal(await stripVideoTracks(new Blob([])), null);
});
