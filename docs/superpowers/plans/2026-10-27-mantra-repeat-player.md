# 만트라 반복 재생기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 휴대폰(안드로이드 크롬)에서 동영상·음성 파일을 정해진 횟수만큼 반복 재생하며 횟수·경과시간을 보여 주고, 마지막 회차·완료 알림음을 울리며, 내 목록·즐겨찾기를 유지하는 정적 웹앱.

**Architecture:** 빌드 없는 정적 HTML/CSS/ES 모듈. 순수 로직(회차 세기, 스톱워치, 시간 표시, 설정, 목록 정렬)은 DOM 없는 모듈로 분리해 Node 내장 테스트 러너로 검증한다. 브라우저 전용 부분(IndexedDB 저장소, 미디어 엔진)은 `tests/browser/*.html` 자체 검사 페이지로 검증하고, 화면(app.js)은 데스크톱 크롬과 실기기로 확인한다. 소리는 항상 `<audio>` 하나에서 나오고 `<video>`는 음소거로 그림만 동기화한다.

**Tech Stack:** HTML, CSS, JavaScript ES modules (외부 라이브러리 없음), IndexedDB, Media Session API, Screen Wake Lock API, Node 24 `node --test` (개발용만), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-27-mantra-repeat-player-design.md` — 구현자는 이 계획과 스펙을 함께 읽는다.

## Global Constraints

- 앱 코드에 외부 라이브러리·CDN·빌드 도구를 쓰지 않는다. `package.json`은 `"type": "module"`과 `test` 스크립트만 둔다(의존성 0개).
- 모든 화면 문구는 한국어.
- 모든 경로는 상대 경로(`./js/app.js`). 배포 주소는 `https://okyoung2.github.io/aviPlayCounter/` 하위 경로다.
- 파일은 기기 밖으로 보내지 않는다(네트워크 요청은 자기 정적 파일뿐).
- 반복 횟수 프리셋: `3, 9, 11, 27, 54, 108`, 직접 입력(1~9999 정수), 무한.
- 표시 위치: `top-left`, `top-right`, `bottom-left`, `bottom-right`.
- 기본 설정(처음 사용 시): 횟수 108, 위치 `top-right`, 마지막 회차 알림음 켬, 완료 알림음 켬.
- 경과시간 표기: 1시간 미만 `mm:ss`, 이상 `h:mm:ss`. 일시정지 동안 멈춤.
- 주 대상: 안드로이드 크롬(시험 기기 갤럭시 퀀텀5 SM-A556S). 아이폰 사파리는 화면 켠 상태 기본 동작만.
- 커밋 메시지 끝에 다음 두 줄을 붙인다:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01H8wcKbcqCwyZ95ms5t6jWR`

## Review Focus

1. **저장 공간 부족** — 큰 동영상 추가 중 `QuotaExceededError`가 나면 앱이 멈추지 않고 "저장 공간이 부족해요…" 문구로 알리고 나머지 파일은 계속 추가된다. → Task 3(`describeAddError`), Task 5(저장소 검사 페이지).
2. **재생할 수 없는 파일** — 코덱 미지원·깨진 파일은 `load()`가 거부되고 "이 파일은 재생할 수 없어요" 문구와 함께 설정 화면에 남는다. → Task 6.
3. **회차 이중 집계** — 완료/정지 후 늦게 도착한 `ended`, 같은 회차의 중복 `ended`가 횟수를 늘리지 않는다. → Task 2(카운터 no-op), Task 6(정지 후 리스너 해제).
4. **잠금 화면에서 일시정지** — 알림창/잠금 화면의 일시정지·재생 버튼으로 멈추면 경과시간도 멈추고 재개된다. 앱 버튼이 아니라 플레이어 상태 이벤트에 스톱워치를 묶는다. → Task 6(`onPlayingChange`), Task 8.
5. **같은 파일 중복 추가** — 이름과 크기가 같은 파일은 다시 복사하지 않고 "이미 목록에 있어요"로 알린다. → Task 3(`isDuplicate`), Task 5.

---

## File Structure

```
index.html                 화면 4개(목록·설정·재생·결과) 마크업, 미디어 요소
manifest.webmanifest       홈 화면 추가용
css/style.css              전체 스타일
js/format.js               formatElapsed
js/stopwatch.js            일시정지 가능한 스톱워치(시계 주입)
js/counter.js              회차 세기 상태기계
js/settings.js             프리셋, 기본값, 직접 입력 검증, 설정 결정
js/library.js              파일 종류 판별, 목록 정렬, 중복 판별, 추가 오류 문구
js/store.js                IndexedDB 저장소(브라우저 전용)
js/player.js               미디어 엔진: audio+muted video, 알림음, Media Session, Wake Lock (브라우저 전용)
js/app.js                  화면 전환과 연결
sounds/last.wav            마지막 회차 알림음(생성물)
sounds/done.wav            완료 알림음(생성물)
icons/icon-192.png, icons/icon-512.png   (생성물)
tools/make-assets.mjs      알림음·아이콘·테스트용 소리 생성
tools/serve.mjs            로컬 정적 서버(개발용)
tests/*.test.js            Node 단위 테스트
tests/browser/store.html   저장소 자체 검사 페이지
tests/browser/player.html  미디어 엔진 자체 검사 페이지
tests/fixtures/tick.wav    1초 테스트 소리(생성물)
docs/device-test.md        사용자용 실기기 시험 순서표
```

---

### Task 1: 프로젝트 준비와 시간 유틸리티

**Files:**
- Create: `package.json`, `.gitignore`, `tools/serve.mjs`, `js/format.js`, `js/stopwatch.js`
- Test: `tests/format.test.js`, `tests/stopwatch.test.js`

**Interfaces:**
- Produces:
  - `formatElapsed(ms: number): string`
  - `createStopwatch(now?: () => number): { start(): void, pause(): void, resume(): void, elapsedMs(): number, running: boolean }` — `now` 기본값 `() => performance.now()`.

- [ ] **Step 1: 저장소와 개발 도구 준비**

`git init`, 기본 브랜치 `main`. `.gitignore`에 `.superpowers/`, `node_modules/`. `package.json`: `{"name":"avi-play-counter","private":true,"type":"module","scripts":{"test":"node --test tests/","serve":"node tools/serve.mjs"}}`. `tools/serve.mjs`: Node 내장 `http`만 써서 프로젝트 루트를 `http://localhost:8080/`으로 제공(`.js`→`text/javascript`, `.wav`→`audio/wav`, `.webmanifest`→`application/manifest+json`, `.png`, `.html`, `.css`, `.md`). 기존 `docs/` 파일 포함 첫 커밋.

- [ ] **Step 2: 실패하는 테스트 작성**

```js
// tests/format.test.js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { formatElapsed } from '../js/format.js';
test('formats under an hour as mm:ss', () => {
  assert.equal(formatElapsed(0), '00:00');
  assert.equal(formatElapsed(61_000), '01:01');
  assert.equal(formatElapsed(59_999), '00:59');      // 초 단위 내림
  assert.equal(formatElapsed(3_599_000), '59:59');
});
test('formats an hour or more as h:mm:ss', () => {
  assert.equal(formatElapsed(3_600_000), '1:00:00');
  assert.equal(formatElapsed(3_725_000), '1:02:05');
});
```

```js
// tests/stopwatch.test.js
test('counts only while running', () => {
  let t = 1000; const sw = createStopwatch(() => t);
  sw.start(); t = 4000; assert.equal(sw.elapsedMs(), 3000);
  sw.pause(); t = 10_000; assert.equal(sw.elapsedMs(), 3000);
  sw.resume(); t = 11_000; assert.equal(sw.elapsedMs(), 4000);
});
test('pause and resume are idempotent', () => {
  let t = 0; const sw = createStopwatch(() => t);
  sw.start(); t = 1000; sw.pause(); sw.pause(); t = 5000; sw.resume(); sw.resume(); t = 6000;
  assert.equal(sw.elapsedMs(), 2000);
});
test('elapsed is 0 before start', () => { assert.equal(createStopwatch(() => 50).elapsedMs(), 0); });
```

- [ ] **Step 3: 실패 확인** — Run: `npm test` / Expected: FAIL (모듈 없음)
- [ ] **Step 4: `js/format.js`, `js/stopwatch.js` 구현**
- [ ] **Step 5: 통과 확인** — Run: `npm test` / Expected: 모든 테스트 PASS
- [ ] **Step 6: Commit** — `chore: project setup, time formatting and stopwatch`

---

### Task 2: 회차 세기 상태기계

**Files:**
- Create: `js/counter.js`
- Test: `tests/counter.test.js`

**Interfaces:**
- Produces: `createCounter(target: number): Counter` — `target`은 1 이상 정수 또는 `Infinity`.
  - `Counter.start(): Step` — 1회차 시작
  - `Counter.trackEnded(): Step` — 한 회차 끝까지 재생됨
  - `Counter.current: number` (지금 재생 중인 회차, 시작 전 0), `Counter.completed: number`, `Counter.target: number`, `Counter.finished: boolean`
  - `Step = { action: 'play' | 'finish', lastRound: boolean, complete: boolean }` — `play`: 처음부터 다시 재생, `lastRound`: 지금 시작하는 회차가 마지막(알림음 대상), `complete`: 목표 달성(완료 알림음 대상).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('target 3: counts rounds and flags the last round start', () => {
  const c = createCounter(3);
  assert.deepEqual(c.start(), { action: 'play', lastRound: false, complete: false });
  assert.equal(c.current, 1);
  assert.deepEqual(c.trackEnded(), { action: 'play', lastRound: false, complete: false });
  assert.deepEqual(c.trackEnded(), { action: 'play', lastRound: true, complete: false });
  assert.equal(c.current, 3);
  assert.deepEqual(c.trackEnded(), { action: 'finish', lastRound: false, complete: true });
  assert.equal(c.completed, 3); assert.equal(c.finished, true);
});
test('target 1: first round is the last round', () => {
  assert.deepEqual(createCounter(1).start(), { action: 'play', lastRound: true, complete: false });
});
test('infinite: never last round, never finishes', () => {
  const c = createCounter(Infinity); c.start();
  for (let i = 0; i < 500; i++) assert.deepEqual(c.trackEnded(), { action: 'play', lastRound: false, complete: false });
  assert.equal(c.completed, 500); assert.equal(c.current, 501);
});
test('ended after finish is a no-op', () => {           // Review Focus 3
  const c = createCounter(1); c.start(); c.trackEnded();
  assert.deepEqual(c.trackEnded(), { action: 'finish', lastRound: false, complete: false });
  assert.equal(c.completed, 1);
});
test('rejects invalid targets', () => {
  for (const t of [0, -1, 2.5, NaN]) assert.throws(() => createCounter(t));
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/counter.test.js` / Expected: FAIL
- [ ] **Step 3: `js/counter.js` 구현**
- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: PASS
- [ ] **Step 5: Commit** — `feat: round counter state machine`

---

### Task 3: 설정과 목록 규칙

**Files:**
- Create: `js/settings.js`, `js/library.js`
- Test: `tests/settings.test.js`, `tests/library.test.js`

**Interfaces:**
- Produces (`js/settings.js`):
  - `PRESETS = [3, 9, 11, 27, 54, 108]`, `CORNERS = ['top-left','top-right','bottom-left','bottom-right']`
  - `Settings = { count: number | null, corner: string, lastAlert: boolean, doneAlert: boolean }` — `count: null`이 무한(JSON 저장 가능해야 하므로 `Infinity`를 쓰지 않는다).
  - `DEFAULT_SETTINGS: Settings = { count: 108, corner: 'top-right', lastAlert: true, doneAlert: true }`
  - `parseCustomCount(text: string): number | null` — 앞뒤 공백 허용, 1~9999 정수만, 아니면 `null`.
  - `resolveSettings(itemSettings: Settings | null, lastUsed: Settings | null): Settings` — 파일별 값 → 최근 값 → 기본값 순. 빠진 키는 기본값으로 채움.
  - `targetOf(s: Settings): number` — `s.count ?? Infinity`.
- Produces (`js/library.js`):
  - `Item = { id: string, name: string, size: number, kind: 'video' | 'audio', durationSec: number | null, favorite: boolean, addedAt: number, settings: Settings | null }`
  - `kindOf(mimeType: string, fileName: string): 'video' | 'audio' | null` — MIME 우선, 비어 있으면 확장자(`mp4 m4v mov 3gp webm mkv` → video, `mp3 m4a aac wav ogg oga opus amr flac` → audio).
  - `sortLibrary(items: Item[]): Item[]` — 새 배열. 즐겨찾기 먼저, 각 묶음 안에서 `addedAt` 내림차순.
  - `isDuplicate(items: Item[], file: { name: string, size: number }): boolean`
  - `describeAddError(err: unknown, fileName: string): string`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// tests/settings.test.js
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
```

```js
// tests/library.test.js
test('kindOf', () => {
  assert.equal(kindOf('video/mp4', 'a.mp4'), 'video');
  assert.equal(kindOf('audio/mpeg', 'a.mp3'), 'audio');
  assert.equal(kindOf('', '만트라.M4A'), 'audio');
  assert.equal(kindOf('', 'clip.mp4'), 'video');
  assert.equal(kindOf('image/png', 'a.png'), null);
  assert.equal(kindOf('', 'notes.txt'), null);
});
test('sortLibrary: favorites first, newest first within groups', () => {
  const it = (id, favorite, addedAt) => ({ id, favorite, addedAt });
  const out = sortLibrary([it('a', false, 1), it('b', true, 2), it('c', false, 3), it('d', true, 1)]);
  assert.deepEqual(out.map(x => x.id), ['b', 'd', 'c', 'a']);
});
test('isDuplicate matches name and size', () => {           // Review Focus 5
  const items = [{ name: 'om.mp4', size: 100 }];
  assert.equal(isDuplicate(items, { name: 'om.mp4', size: 100 }), true);
  assert.equal(isDuplicate(items, { name: 'om.mp4', size: 101 }), false);
});
test('describeAddError', () => {                             // Review Focus 1
  const quota = Object.assign(new Error('x'), { name: 'QuotaExceededError' });
  assert.equal(describeAddError(quota, 'big.mp4'), '저장 공간이 부족해요. "big.mp4"을(를) 추가하지 못했어요.');
  assert.equal(describeAddError(new Error('?'), 'a.mp3'), '"a.mp3"을(를) 추가하지 못했어요.');
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` / Expected: 새 테스트 FAIL
- [ ] **Step 3: `js/settings.js`, `js/library.js` 구현**
- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: PASS
- [ ] **Step 5: Commit** — `feat: settings rules and library helpers`

---

### Task 4: 알림음·아이콘·테스트 소리 생성

**Files:**
- Create: `tools/make-assets.mjs`, 생성물 `sounds/last.wav`, `sounds/done.wav`, `icons/icon-192.png`, `icons/icon-512.png`, `tests/fixtures/tick.wav`
- Test: `tests/assets.test.js`

**Interfaces:**
- Produces: `tools/make-assets.mjs`는 `export function makeWav(samples: Float32Array, sampleRate: number): Buffer`, `export function makePng(size: number): Buffer`를 내보내고, 직접 실행하면(`node tools/make-assets.mjs`) 위 다섯 파일을 쓴다. Node 내장 모듈(`fs`, `zlib`)만 사용.
- 소리 정의(합성, 44100Hz 모노 16비트):
  - `last.wav`: 부드러운 종소리 한 번, 기본음 660Hz + 배음(1320Hz 0.4, 1980Hz 0.2), 지수 감쇠, 길이 1.8초, 피크 0.6.
  - `done.wav`: 구별되는 상승 3음(523Hz → 659Hz → 784Hz, 각 0.35초, 마지막 음 1.2초 감쇠), 피크 0.6.
  - `tick.wav`: 1.0초, 440Hz 짧은 비프(0.1초) 뒤 무음.
- 아이콘: 어두운 배경(#1b1712)에 금색(#d9a441) 원과 가운데 점. 다른 디자인은 구현자 판단.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('makeWav writes a valid 16-bit mono RIFF header', () => {
  const buf = makeWav(new Float32Array(44100), 44100);
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  assert.equal(buf.readUInt16LE(22), 1);       // channels
  assert.equal(buf.readUInt32LE(24), 44100);   // sample rate
  assert.equal(buf.readUInt16LE(34), 16);      // bits
  assert.equal(buf.length, 44 + 44100 * 2);
});
test('makePng writes a PNG of the requested size', () => {
  const png = makePng(192);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 192); assert.equal(png.readUInt32BE(20), 192);
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` / Expected: FAIL
- [ ] **Step 3: `tools/make-assets.mjs` 구현** (`import.meta.url`과 `process.argv[1]` 비교로 직접 실행 여부 판별)
- [ ] **Step 4: 통과 확인 후 생성** — Run: `npm test` (PASS), `node tools/make-assets.mjs` → 다섯 파일 생성. 두 알림음을 직접 들어 보고 구별되는지 확인.
- [ ] **Step 5: Commit** — 도구와 생성물 함께. `feat: generated alert sounds, icons and test tone`

---

### Task 5: IndexedDB 저장소

**Files:**
- Create: `js/store.js`, `tests/browser/store.html`

**Interfaces:**
- Consumes: `kindOf`, `isDuplicate`, `describeAddError` (Task 3), `Settings` (Task 3)
- Produces (`js/store.js`, 모두 Promise):
  - `openStore(): Promise<Store>` — DB 이름 `mantra-player`, 버전 1, 객체 저장소 `items`(keyPath `id`), `blobs`(키 = item id, 값 Blob), `meta`(키 문자열). 열 수 없으면 거부한다(호출 측이 임시 모드로 전환).
  - `Store.addFiles(files: File[]): Promise<{ added: Item[], skipped: string[], failed: string[] }>` — 파일마다: 종류 판별 실패면 `failed`에 "…은(는) 동영상/음성 파일이 아니에요" 문구, 중복이면 `skipped`에 "이미 목록에 있어요: <이름>", 저장 실패면 `describeAddError` 문구. 한 파일 실패가 나머지를 막지 않는다. `durationSec`는 임시 미디어 요소의 `loadedmetadata`로 구하고, 5초 안에 못 구하면 `null`. 첫 추가 때 `navigator.storage?.persist?.()`를 요청한다. `id`는 `crypto.randomUUID()`.
  - `Store.listItems(): Promise<Item[]>` (정렬 안 함)
  - `Store.updateItem(id: string, patch: Partial<Item>): Promise<Item>`
  - `Store.removeItem(id: string): Promise<void>` — 항목과 Blob을 함께 삭제
  - `Store.getBlob(id: string): Promise<Blob>`
  - `Store.getLastUsed(): Promise<Settings | null>`, `Store.setLastUsed(s: Settings): Promise<void>` (`meta`의 `lastUsed` 키)

- [ ] **Step 1: 자체 검사 페이지 작성** — `tests/browser/store.html`은 테스트 전용 DB 이름(`openStore`에 선택 인자 `dbName`을 허용)으로 아래를 순서대로 실행하고 각 줄에 `PASS`/`FAIL`을 표시, 끝에 `ALL PASS` 또는 `FAILED n`을 출력한다. 시작할 때 테스트 DB를 지운다.
  - `new File([...], 'om.mp4', {type:'video/mp4'})`와 `'a.mp3'`(`audio/mpeg`) 추가 → `added.length === 2`
  - 같은 `om.mp4` 재추가 → `skipped.length === 1`, 목록 2개 유지
  - `notes.txt`(`text/plain`) 추가 → `failed.length === 1`
  - `updateItem(id, { favorite: true, settings: {...} })` 후 `listItems()`에 반영
  - `getBlob(id)`의 `size`가 원본과 같음
  - `setLastUsed` → `getLastUsed` 왕복
  - `removeItem` 후 목록·Blob 모두 사라짐(`getBlob` 거부)
  - DB를 닫고 다시 `openStore` → 데이터 유지
- [ ] **Step 2: 실패 확인** — Run: `npm run serve` 후 크롬에서 `http://localhost:8080/tests/browser/store.html` / Expected: 모듈 없음 오류 또는 FAIL
- [ ] **Step 3: `js/store.js` 구현**
- [ ] **Step 4: 통과 확인** — 같은 페이지 새로고침 / Expected: `ALL PASS`. `npm test`도 PASS.
- [ ] **Step 5: Commit** — `feat: IndexedDB library store`

---

### Task 6: 미디어 엔진

**Files:**
- Create: `js/player.js`, `tests/browser/player.html`

**Interfaces:**
- Consumes: `tests/fixtures/tick.wav`, `sounds/*.wav` (Task 4), `createCounter` (Task 2, 검사 페이지에서만)
- Produces: `createPlayer({ audio: HTMLAudioElement, video: HTMLVideoElement, lastAlertSrc: string, doneAlertSrc: string }): Player`
  - `load(blob: Blob, kind: 'video'|'audio'): Promise<void>` — 기존 object URL 해제 후 새로 만든다. `audio`에 항상 넣고, `kind === 'video'`면 `video`에도 넣고 `video.muted = true`. `audio`의 `loadedmetadata`에서 해결, `error` 또는 10초 초과 시 `Error('unplayable')`로 거부(Review Focus 2).
  - `primeAlerts(): Promise<void>` — 반드시 사용자 터치 처리 중에 호출. 두 알림음 요소를 `volume=0`으로 재생 후 즉시 정지하고 볼륨을 1로 되돌린다(화면 꺼진 상태에서도 울릴 수 있게).
  - `play(): Promise<void>`, `pause(): void`, `restart(): Promise<void>` (`currentTime = 0` 후 재생), `stop(): void` (정지, 리스너 해제, 이후 `onEnded` 호출 안 함 — Review Focus 3, Wake Lock 해제)
  - `onEnded(cb: () => void): void` — `audio`의 `ended`. `loop` 속성은 쓰지 않는다.
  - `onPlayingChange(cb: (playing: boolean) => void): void` — `audio`의 `play`/`pause` 이벤트 기준. 잠금 화면 조작도 여기로 들어온다(Review Focus 4).
  - `playAlert(which: 'last'|'done'): void` — 본 소리 위에 겹쳐 재생, 실패해도 예외 없음.
  - `setNowPlaying(title: string, progress: string): void` — `navigator.mediaSession.metadata = new MediaMetadata({ title, artist: progress })`, 액션 핸들러 `play`/`pause` 등록(지원 시).
- 동작 규칙(구현자가 지켜야 할 것):
  - 영상 동기화: `audio`의 `play`/`pause`/`seeked`와 `document`의 `visibilitychange`(보임)에서 `video.currentTime = audio.currentTime` 후 재생/정지를 따라간다. 재생 중 1초마다 차이가 0.3초를 넘으면 맞춘다. 화면이 숨겨진 동안에는 영상을 건드리지 않는다.
  - Wake Lock: 재생 시작 시 `navigator.wakeLock?.request('screen')`, 화면이 다시 보이고 재생 중이면 재요청, 정지 시 해제. 실패는 무시.

- [ ] **Step 1: 자체 검사 페이지 작성** — `tests/browser/player.html`에 `▶ 검사 시작` 버튼(자동 재생 정책 때문에 터치로 시작). 누르면 `primeAlerts()` 후 아래를 실행하고 `PASS`/`FAIL` 표시, 끝에 `ALL PASS`:
  - `tick.wav` 로드, `createCounter(3)`과 연결(`onEnded` → `trackEnded()` → `play`면 `restart()`, `lastRound`면 `playAlert('last')`, `complete`면 `playAlert('done')`) → 약 3초 뒤 `completed === 3`, `ended` 처리 3회, `last` 알림 1회, `done` 알림 1회
  - 완료 뒤 `stop()`하고 `audio.dispatchEvent(new Event('ended'))` → `onEnded` 콜백이 더 불리지 않음
  - `onPlayingChange`가 `pause()` → `false`, `play()` → `true`로 불림
  - `new Blob([new Uint8Array(1000)], { type: 'video/mp4' })` 로드 → `unplayable`로 거부
- [ ] **Step 2: 실패 확인** — 크롬에서 `http://localhost:8080/tests/browser/player.html` / Expected: FAIL
- [ ] **Step 3: `js/player.js` 구현**
- [ ] **Step 4: 통과 확인** — 같은 페이지에서 버튼 / Expected: `ALL PASS`, 두 알림음이 실제로 들림
- [ ] **Step 5: Commit** — `feat: media engine with single audio source and muted video sync`

---

### Task 7: 목록 화면과 설정 화면

**Files:**
- Create: `index.html`, `css/style.css`, `js/app.js`

**Interfaces:**
- Consumes: `openStore`/`Store` (Task 5), `sortLibrary` (Task 3), `PRESETS`, `CORNERS`, `parseCustomCount`, `resolveSettings` (Task 3)
- Produces: `index.html`의 화면 섹션 `#screen-library`, `#screen-setup`, `#screen-player`, `#screen-result`(한 번에 하나만 보임), 미디어 요소 `#audio`, `#video`. `js/app.js` 안의 `showScreen(name: 'library'|'setup'|'player'|'result')`, `openSetup(item: Item)`, `startPlayback(item: Item, settings: Settings)` — Task 8이 `startPlayback`의 본문을 채운다(이 태스크에서는 설정 저장 후 `player` 화면으로 넘어가기만 한다).

화면 규칙(스펙 5.0, 5.1):
- 목록: `＋ 파일 추가` 버튼(`<input type="file" accept="video/*,audio/*" multiple hidden>`), 안내 문구 정확히: `카톡에서 받은 파일은 보통 Movies/KakaoTalk(동영상) 또는 Download/KakaoTalk(음성·기타)에 있어요. 카톡에서 먼저 '저장'을 눌러 주세요.` 각 항목: 🎬/🎵 아이콘, 이름, 길이(`formatElapsed(durationSec*1000)`, 없으면 생략), ★ 토글, 🗑 삭제(`confirm` 대신 화면 안 확인 줄 — 브라우저 대화상자 쓰지 않음). 즐겨찾기 항목에는 `▶ 바로 재생` 버튼. 항목 이름을 누르면 설정 화면. 빈 목록이면 안내만 크게. 추가 결과의 `skipped`/`failed` 문구는 화면 하단 알림 줄로 몇 초 보여 준다.
- 설정: 파일 이름, `← 목록`, 횟수 칩(프리셋 6개, `직접`, `∞`), `직접`을 고르면 숫자 입력(`inputmode="numeric"`), 유효하지 않으면 `시작` 비활성 + `1~9999 사이 숫자를 넣어 주세요`. 위치 칩 ↖ ↗ ↙ ↘. 스위치 2개 `마지막 회차 알림음`, `완료 알림음`. `▶ 시작`. 초기값은 `resolveSettings(item.settings, lastUsed)`.
- `▶ 시작`/`▶ 바로 재생`: 설정을 `updateItem(item.id, { settings })`와 `setLastUsed(settings)`로 저장한 뒤 `startPlayback`.
- 저장소를 열 수 없으면 임시 모드: 고른 파일을 메모리에만 두고 목록 위에 `이 브라우저에서는 목록이 저장되지 않아요` 표시. 재생은 정상 동작.
- 스타일: 차분한 어두운 톤, 세로 휴대폰 우선, 큰 터치 영역(최소 44px), 가로 화면에서 깨지지 않게. 나머지는 구현자 판단.

- [ ] **Step 1: 화면 구현** (`index.html`, `css/style.css`, `js/app.js`)
- [ ] **Step 2: 확인** — `npm run serve`, 데스크톱 크롬 기기 에뮬레이션(세로 412×915)에서: 파일 2개 추가 → 목록 표시, 같은 파일 재추가 → `이미 목록에 있어요` 알림, ★ 누르면 맨 위로, 삭제 확인 후 사라짐, 새로고침 후 목록·★ 유지, 설정 화면에서 `직접`에 `0` 입력 → 시작 비활성, `27`·↙·완료 알림음 끔으로 시작 → 새로고침 후 같은 파일 설정 화면에 그 값이 선택되어 있음. 콘솔 오류 없음. `npm test` PASS.
- [ ] **Step 3: Commit** — `feat: library and setup screens`

---

### Task 8: 재생 화면과 결과 화면

**Files:**
- Modify: `index.html`, `css/style.css`, `js/app.js`

**Interfaces:**
- Consumes: `createPlayer` (Task 6), `createCounter` (Task 2), `createStopwatch`, `formatElapsed` (Task 1), `targetOf` (Task 3), `startPlayback`, `showScreen` (Task 7)

동작 규칙(스펙 5.2, 5.3, 6):
- `startPlayback(item, settings)`는 `▶` 터치 처리 안에서 `primeAlerts()`를 먼저 부른 뒤 `getBlob` → `load` → `counter.start()` → 재생. `load` 거부 시 설정 화면에 머물며 `이 파일은 재생할 수 없어요` 표시.
- `onEnded` → `trackEnded()`: `play`면 `restart()`; `lastRound && settings.lastAlert`면 `playAlert('last')`; `complete`면 `doneAlert`가 켜져 있을 때 `playAlert('done')` 후 결과 화면.
- 스톱워치는 `onPlayingChange`로만 `pause`/`resume`(Review Focus 4).
- 배지: `settings.corner` 모서리에 `${current} / ${target === Infinity ? '∞' : target}`과 둘째 줄 `formatElapsed`. 0.5초마다 갱신. `setNowPlaying(item.name, '37 / 108')` 형식으로 회차가 바뀔 때마다 갱신.
- 음성 파일이면 검은 화면 가운데 파일 이름. 영상은 `object-fit: contain`.
- 화면 탭 → `⏸ 일시정지`/`▶ 재개`, `■ 정지` 버튼이 3초 보였다가 사라짐.
- 정지 → `player.stop()`, 결과 화면 `${completed}회 재생`. 완료 → `${target}회 완료`. 둘 다 둘째 줄 `걸린 시간 ${formatElapsed}`. 버튼 `다시 하기`(같은 파일·설정으로 `startPlayback`), `처음으로`(목록).
- 재생 화면에서 뒤로 가기(브라우저 back) 시 정지와 같은 처리 — 구현 방식은 구현자 판단.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인** — 데스크톱 크롬 에뮬레이션에서 `tests/fixtures/tick.wav`와 짧은 mp4를 추가해: 3회 설정 → 3회차 시작에 종소리, 끝나면 완료음과 `3회 완료`; 완료 알림음 끈 채 → 소리 없이 결과 화면; ∞ → 5회 이상 돈 뒤 정지 → `n회 재생`; 일시정지 중 경과시간 멈춤; 배지가 고른 모서리 4곳 모두 정확; 탭 → 컨트롤 표시 후 3초 뒤 사라짐; 다른 탭으로 전환했다 돌아와도 횟수 정확·영상 위치 일치; 깨진 파일 → `이 파일은 재생할 수 없어요`. `npm test` PASS.
- [ ] **Step 3: Commit** — `feat: player and result screens`

---

### Task 9: 홈 화면 추가, 시험 순서표, 배포

**Files:**
- Create: `manifest.webmanifest`, `docs/device-test.md`
- Modify: `index.html` (manifest 링크, `theme-color`, 목록 화면 하단 `재생이 멈추나요?` 접이식 도움말)

**Interfaces:**
- Consumes: `icons/*.png` (Task 4)

- [ ] **Step 1: manifest와 도움말** — `manifest.webmanifest`: `name` `만트라 반복 재생`, `short_name` `만트라`, `start_url` `./`, `scope` `./`, `display` `standalone`, `background_color`/`theme_color` `#1b1712`, 아이콘 192·512. 도움말 문구에 삼성 절전 예외 방법: `설정 > 배터리 > 백그라운드 사용 제한 > 절전 예외 앱에 Chrome 추가` 및 `잠자는 앱/깊은 잠자는 앱 목록에서 Chrome 빼기`.
- [ ] **Step 2: `docs/device-test.md` 작성** — 사용자가 따라 할 순서(한국어): 주소 열기 → 홈 화면에 추가 → 카톡에서 만트라 파일 저장 → 파일 추가 → 3회 설정·두 알림음 켬 → 시작 직후 화면 끄기 → 마지막 회차 종소리·완료음이 들리는지 → 화면 켜서 `3회 완료` 확인 → 잠금 화면 일시정지·재생 → 브라우저를 완전히 닫았다 열어 목록·★ 유지 확인. 별도 절 "아이폰(있으면)": 사파리에서 화면을 켠 채 3회 재생·알림음·결과 화면 확인(화면을 끄면 멈추는 것은 정상). 각 항목 옆에 □ 체크칸, 실패 시 적을 칸.
- [ ] **Step 3: 확인** — 데스크톱 크롬 DevTools > Application > Manifest에 오류 없음, 아이콘 표시. `npm test` PASS. Commit — `feat: web app manifest, battery help and device test sheet`
- [ ] **Step 4: 배포 방식 사용자 확인** — 사용자에게 묻는다: `okyoung2` 계정에 새 저장소 `aviPlayCounter`를 만들지, 기존 저장소의 하위 폴더 `aviPlayCounter/`로 넣을지. 답을 받기 전에는 푸시하지 않는다.
- [ ] **Step 5: 배포** — 답에 따라 푸시하고 GitHub Pages를 켠다. Run: `curl -sI https://okyoung2.github.io/aviPlayCounter/` / Expected: `HTTP/2 200`. `manifest.webmanifest`, `js/app.js`, `sounds/last.wav`도 200.
- [ ] **Step 6: 사용자 실기기 시험** — 주소와 `docs/device-test.md`를 사용자에게 전달하고 갤럭시 퀀텀5 결과를 받는다. 실패 항목은 superpowers:systematic-debugging으로 다룬다.
