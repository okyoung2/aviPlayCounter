// 알림음, 아이콘, 테스트용 소리를 생성한다. Node 내장 모듈만 사용.
// 실행: node tools/make-assets.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RATE = 44100;

export function makeWav(samples, sampleRate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

// 감쇠하는 음 하나를 out 의 start 위치부터 더한다.
function addTone(out, startSec, durSec, freq, partials, decay, peak) {
  const start = Math.floor(startSec * RATE);
  const n = Math.min(out.length - start, Math.floor(durSec * RATE));
  const attack = Math.floor(0.005 * RATE);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let v = 0;
    for (const [mult, amp] of partials) v += amp * Math.sin(2 * Math.PI * freq * mult * t);
    const env = Math.min(1, i / attack) * Math.exp(-decay * t);
    out[start + i] += v * env * peak;
  }
}

function normalize(out, peak) {
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / max) * peak;
  return out;
}

// 마지막 회차: 부드러운 종소리 한 번.
export function lastAlertSamples() {
  const out = new Float32Array(Math.floor(1.8 * RATE));
  addTone(out, 0, 1.8, 660, [[1, 1], [2, 0.4], [3, 0.2]], 2.5, 1);
  return normalize(out, 0.6);
}

// 완료: 상승 3음(도-미-솔).
export function doneAlertSamples() {
  const out = new Float32Array(Math.floor((0.35 * 2 + 1.2) * RATE));
  const partials = [[1, 1], [2, 0.3]];
  addTone(out, 0, 0.35, 523, partials, 4, 1);
  addTone(out, 0.35, 0.35, 659, partials, 4, 1);
  addTone(out, 0.7, 1.2, 784, partials, 2.5, 1);
  return normalize(out, 0.6);
}

// 테스트용: 1초, 앞 0.1초만 440Hz 비프.
export function tickSamples() {
  const out = new Float32Array(RATE);
  for (let i = 0; i < 0.1 * RATE; i++) out[i] = 0.3 * Math.sin(2 * Math.PI * 440 * (i / RATE));
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// 어두운 배경에 금색 고리와 가운데 점.
export function makePng(size) {
  const bg = [0x1b, 0x17, 0x12];
  const gold = [0xd9, 0xa4, 0x41];
  const c = size / 2;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / size;
      const ring = d > 0.27 && d < 0.33;
      const dot = d < 0.08;
      const col = ring || dot ? gold : bg;
      raw.set(col, row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const out = (rel, data) => {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    console.log(`wrote ${rel} (${data.length} bytes)`);
  };
  out('sounds/last.wav', makeWav(lastAlertSamples(), RATE));
  out('sounds/done.wav', makeWav(doneAlertSamples(), RATE));
  out('tests/fixtures/tick.wav', makeWav(tickSamples(), RATE));
  out('icons/icon-192.png', makePng(192));
  out('icons/icon-512.png', makePng(512));
}
