import { openStore, createMemoryStore } from './store.js';
import { sortLibrary } from './library.js';
import {
  PRESETS, CORNERS, CORNER_ARROWS, parseCustomCount, resolveSettings, targetOf, describeSettings,
} from './settings.js';
import { formatElapsed, progressRatio } from './format.js';
import { createPlayer } from './player.js';
import { createCounter } from './counter.js';
import { createStopwatch } from './stopwatch.js';
import { looksLikeDesktopMode } from './env.js';

const $ = (id) => document.getElementById(id);
const CORNER_NAMES = { 'top-left': '왼쪽 위', 'top-right': '오른쪽 위', 'bottom-left': '왼쪽 아래', 'bottom-right': '오른쪽 아래' };

let store;
let items = [];
let lastUsed = null;
let pendingDeleteId = null;
let setupItem = null;
let draft = null; // { count, corner, lastAlert, doneAlert, custom: boolean, customText }

// ---- 공통 ----

const SCREENS = ['library', 'setup', 'player', 'result'];
function showScreen(name) {
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
  window.scrollTo(0, 0);
}

// 목록이 아닌 화면은 항상 기록 한 칸 위에 둔다. 그래서 뒤로 가기는 목록으로 돌아간다.
function go(name) {
  if (name === 'library') {
    if (history.state?.app) history.back(); // popstate 에서 목록을 보여 준다.
    else showScreen('library');
    return;
  }
  if (history.state?.app) history.replaceState({ app: true }, '');
  else history.pushState({ app: true }, '');
  showScreen(name);
}

let toastTimer = null;
// sticky: 다음 안내가 나올 때까지 계속 보여 준다.
function toast(lines, { sticky = false } = {}) {
  const text = [].concat(lines).filter(Boolean).join('\n');
  if (!text) return;
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

// ---- 목록 ----

async function refreshLibrary() {
  items = sortLibrary(await store.listItems());
  renderLibrary();
}

function renderLibrary() {
  const list = $('library-list');
  list.replaceChildren();
  $('empty').hidden = items.length > 0;
  for (const item of items) {
    const meta = item.durationSec ? formatElapsed(item.durationSec * 1000) : '';
    const li = el('li', { class: 'item' },
      el('span', { class: 'item-kind', 'aria-label': item.kind === 'video' ? '동영상' : '음성' },
        item.kind === 'video' ? '🎬' : '🎵'),
      el('button', { class: 'item-main', type: 'button', onclick: () => openSetup(item) },
        el('span', { class: 'item-name' }, item.name),
        meta ? el('span', { class: 'item-meta' }, meta) : ''),
      el('span', { class: 'item-actions' },
        el('button', {
          class: 'icon-btn fav', type: 'button', 'aria-pressed': String(item.favorite),
          'aria-label': item.favorite ? '즐겨찾기 해제' : '즐겨찾기',
          onclick: () => toggleFavorite(item),
        }, item.favorite ? '★' : '☆'),
        el('button', {
          class: 'icon-btn', type: 'button', 'aria-label': '삭제',
          onclick: () => { pendingDeleteId = item.id; renderLibrary(); },
        }, '🗑')),
    );
    // 지금 설정을 보여 주고, 횟수·소리를 바꾸는 곳을 바로 알 수 있게 한다.
    li.append(el('p', { class: 'item-settings' },
      item.settings ? describeSettings(item.settings) : '반복 횟수·알림음을 아직 정하지 않았어요'));
    li.append(el('div', { class: 'item-buttons' },
      el('button', { class: 'secondary', type: 'button', onclick: () => openSetup(item) }, '⚙ 횟수·소리 설정'),
      item.favorite
        ? el('button', { class: 'primary', type: 'button', onclick: () => quickPlay(item) }, '▶ 바로 재생')
        : ''));
    if (pendingDeleteId === item.id) {
      li.append(el('div', { class: 'confirm-row' },
        el('span', {}, '목록에서 지울까요?'),
        el('button', { class: 'danger', type: 'button', onclick: () => removeItem(item) }, '지우기'),
        el('button', { type: 'button', onclick: () => { pendingDeleteId = null; renderLibrary(); } }, '취소')));
    }
    list.append(li);
  }
}

async function toggleFavorite(item) {
  await store.updateItem(item.id, { favorite: !item.favorite });
  await refreshLibrary();
}

async function removeItem(item) {
  pendingDeleteId = null;
  await store.removeItem(item.id);
  await refreshLibrary();
}

async function addFiles(files) {
  if (!files.length) return;
  toast('파일을 추가하는 중이에요…', { sticky: true });
  try {
    const r = await store.addFiles(files);
    await refreshLibrary();
    toast([r.added.length ? `${r.added.length}개 추가했어요.` : '', ...r.skipped, ...r.failed]);
  } catch {
    toast('파일을 추가하지 못했어요. 다시 시도해 주세요.');
  }
}

// ---- 설정 ----

function openSetup(item) {
  setupItem = item;
  const s = resolveSettings(item.settings, lastUsed);
  const custom = s.count !== null && !PRESETS.includes(s.count);
  draft = { ...s, custom, customText: custom ? String(s.count) : '' };
  $('setup-name').textContent = item.name;
  $('setup-error').hidden = true;
  renderSetup();
  go('setup');
}

function chip(label, checked, onclick, ariaLabel) {
  return el('button', {
    class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(checked),
    'aria-label': ariaLabel ?? label, onclick,
  }, label);
}

function renderSetup() {
  const counts = $('count-chips');
  counts.replaceChildren(
    ...PRESETS.map((n) => chip(String(n), !draft.custom && draft.count === n, () => {
      Object.assign(draft, { count: n, custom: false });
      renderSetup();
    }, `${n}회`)),
    chip('직접', draft.custom, () => {
      draft.custom = true;
      draft.count = parseCustomCount(draft.customText);
      renderSetup();
      $('custom-count').focus();
    }, '직접 입력'),
    chip('∞', !draft.custom && draft.count === null, () => {
      Object.assign(draft, { count: null, custom: false });
      renderSetup();
    }, '무한 반복'),
  );

  $('custom-row').hidden = !draft.custom;
  if ($('custom-count').value !== draft.customText) $('custom-count').value = draft.customText;
  const invalid = draft.custom && draft.count === null;
  $('custom-error').hidden = !invalid || draft.customText === '';
  $('start-btn').disabled = invalid;

  $('corner-chips').replaceChildren(...CORNERS.map((c) => chip(CORNER_ARROWS[c], draft.corner === c, () => {
    draft.corner = c;
    renderSetup();
  }, CORNER_NAMES[c])));

  $('last-alert').checked = draft.lastAlert;
  $('done-alert').checked = draft.doneAlert;
}

function draftSettings() {
  return { count: draft.count, corner: draft.corner, lastAlert: draft.lastAlert, doneAlert: draft.doneAlert };
}

async function saveSettings(item, settings) {
  lastUsed = settings;
  await Promise.all([
    store.updateItem(item.id, { settings }).catch(() => {}),
    store.setLastUsed(settings).catch(() => {}),
  ]);
  await refreshLibrary();
}

function quickPlay(item) {
  // 한 번도 설정한 적 없는 파일은 기본값으로 시작하지 않고 먼저 설정 화면을 연다.
  if (!item.settings) {
    openSetup(item);
    toast('먼저 반복 횟수와 알림음을 정하고 ▶ 시작을 눌러 주세요.');
    return;
  }
  const settings = resolveSettings(item.settings, lastUsed);
  setupItem = item;
  begin(item, settings);
}

// 터치 처리 안에서 바로 재생을 시작하고, 설정 저장은 나란히 진행한다.
function begin(item, settings) {
  const started = startPlayback(item, settings);
  saveSettings(item, settings);
  return started;
}

// ---- 재생 ----

const CONTROLS_HIDE_MS = 3000;
let player;
let session = null; // { item, settings, counter, stopwatch, tick, playing }
let lastSession = null;
let controlsTimer = null;
let starting = false; // 시작 버튼을 빠르게 두 번 눌러도 한 번만 시작한다.

const progressText = (counter) =>
  `${counter.current} / ${counter.target === Infinity ? '∞' : counter.target}`;

function updateBadge() {
  if (!session) return;
  $('badge-count').textContent = progressText(session.counter);
  $('badge-time').textContent = formatElapsed(session.stopwatch.elapsedMs());
}

function updateProgress(current, duration) {
  $('progress-fill').style.transform = `scaleX(${progressRatio(current, duration)})`;
  $('progress-cur').textContent = formatElapsed(current * 1000);
  $('progress-dur').textContent = Number.isFinite(duration) ? formatElapsed(duration * 1000) : '--:--';
}

// 진행바는 버튼과 함께 나타나고 사라진다.
function setControlsHidden(hidden) {
  $('controls').hidden = hidden;
  $('progress').hidden = hidden;
}

function showControls() {
  setControlsHidden(false);
  clearTimeout(controlsTimer);
  // 일시정지 중에는 계속 보여 준다.
  if (session?.playing) controlsTimer = setTimeout(() => setControlsHidden(true), CONTROLS_HIDE_MS);
}

function hideControls() {
  clearTimeout(controlsTimer);
  setControlsHidden(true);
}

// 볼륨은 0~100 으로 다루고 player 에는 0~1 로 넘긴다.
function applyVolume(percent) {
  player.setVolume(percent / 100);
  $('volume').value = percent;
  $('volume-value').textContent = percent;
  $('volume-icon').textContent = percent === 0 ? '🔇' : '🔊';
}

// 전체 화면은 더블클릭(휴대폰은 두 번 탭)으로만 켜고 끈다.
// 자동으로 켜면 크롬이 '전체 화면을 종료하려면…' 안내를 띄우는데, 웹 페이지에서는 그 안내를 끌 수 없다.
function enterFullscreen() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

async function startPlayback(item, settings) {
  if (starting) return;
  starting = true;
  try {
    await startPlaybackOnce(item, settings);
  } finally {
    starting = false;
  }
}

async function startPlaybackOnce(item, settings) {
  // 터치 처리 중에 먼저 불러서, 화면이 꺼진 뒤에도 알림음이 울리게 한다.
  const primed = player.primeAlerts();
  if (session) finish(false, { silent: true });
  try {
    await player.load(await store.getBlob(item.id), item.kind);
  } catch {
    player.stop();
    exitFullscreen();
    openSetup(item);
    $('setup-error').textContent = '이 파일은 재생할 수 없어요';
    $('setup-error').hidden = false;
    return;
  }
  await primed;

  const counter = createCounter(targetOf(settings));
  const stopwatch = createStopwatch();
  stopwatch.start();
  stopwatch.pause(); // 실제로 소리가 나기 시작할 때부터 센다(onPlayingChange).
  session = { item, settings, counter, stopwatch, tick: setInterval(updateBadge, 500), playing: false };
  lastSession = { item, settings };

  $('badge').className = `badge ${settings.corner}`;
  $('video').hidden = item.kind !== 'video';
  $('audio-title').hidden = item.kind === 'video';
  $('audio-title').textContent = item.name;
  hideControls();
  updateProgress(0, player.position().duration);
  go('player');

  const step = counter.start();
  player.setLoop(!step.lastRound);
  if (step.lastRound && settings.lastAlert) player.playAlert('last');
  player.setNowPlaying(item.name, progressText(counter));
  updateBadge();
  try {
    await player.play();
  } catch {
    showControls(); // 자동 재생이 막히면 ▶ 재개 버튼으로 시작한다.
  }
}

// wrapped: loop 로 이미 다음 회차가 재생 중이다. 아니면 소리가 멈춘 상태라 다시 틀어야 한다.
function onTrackEnded({ wrapped }) {
  if (!session) return;
  const { counter, settings, item } = session;
  const step = counter.trackEnded();
  if (step.action === 'play') {
    player.setLoop(!step.lastRound);
    if (step.lastRound && settings.lastAlert) player.playAlert('last');
    if (!wrapped) player.restart();
    player.setNowPlaying(item.name, progressText(counter));
    updateBadge();
  } else if (step.complete) {
    if (settings.doneAlert) player.playAlert('done');
    finish(true);
  }
}

function onPlaybackError() {
  if (!session) return;
  toast('재생 중 오류가 나서 멈췄어요.');
  finish(false);
}

function onPlayingChange(playing) {
  // 회차가 바뀔 때도 play 이벤트가 오므로, 상태가 실제로 바뀔 때만 반응한다.
  if (!session || session.playing === playing) return;
  session.playing = playing;
  if (playing) session.stopwatch.resume();
  else session.stopwatch.pause();
  $('pause-btn').textContent = playing ? '⏸ 일시정지' : '▶ 재개';
  updateBadge();
  if (!$('controls').hidden || !playing) showControls();
}

// completed: 목표를 채움. 아니면 사용자가 정지함.
function finish(completed, { silent = false } = {}) {
  const s = session;
  session = null;
  clearInterval(s.tick);
  s.stopwatch.pause();
  player.stop();
  hideControls();
  if (silent) return;
  exitFullscreen();
  $('result-count').textContent = completed ? `${s.counter.target}회 완료` : `${s.counter.completed}회 재생`;
  $('result-time').textContent = `걸린 시간 ${formatElapsed(s.stopwatch.elapsedMs())}`;
  $('result-name').textContent = s.item.name;
  go('result');
}

// ---- 시작 ----

function bindEvents() {
  $('add-btn').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    addFiles(files);
  });
  $('back-btn').addEventListener('click', () => go('library'));
  $('custom-count').addEventListener('input', (e) => {
    draft.customText = e.target.value.trim();
    draft.count = parseCustomCount(draft.customText);
    renderSetup();
  });
  $('last-alert').addEventListener('change', (e) => { draft.lastAlert = e.target.checked; });
  $('done-alert').addEventListener('change', (e) => { draft.doneAlert = e.target.checked; });
  $('start-btn').addEventListener('click', () => {
    if ($('start-btn').disabled) return;
    begin(setupItem, draftSettings());
  });

  $('screen-player').addEventListener('click', (e) => {
    if (e.target.closest('#controls')) return;
    if ($('controls').hidden) showControls();
    else hideControls();
  });
  $('screen-player').addEventListener('dblclick', (e) => {
    if (e.target.closest('#controls')) return;
    if (document.fullscreenElement) exitFullscreen();
    else enterFullscreen();
  });
  $('pause-btn').addEventListener('click', () => {
    if (!session) return;
    if (session.playing) player.pause();
    else player.play().catch(() => {});
  });
  $('stop-btn').addEventListener('click', () => { if (session) finish(false); });
  $('volume').addEventListener('input', (e) => {
    applyVolume(Number(e.target.value));
    showControls(); // 조절하는 동안 버튼이 사라지지 않게 한다.
  });
  $('volume').addEventListener('change', (e) => {
    store.setVolume(Number(e.target.value) / 100).catch(() => {});
  });
  $('again-btn').addEventListener('click', () => {
    if (lastSession) startPlayback(lastSession.item, lastSession.settings);
  });
  $('home-btn').addEventListener('click', () => go('library'));

  // 재생 중 뒤로 가기(가장자리 밀기 실수 포함)는 정지하지 않는다. 정지는 ■ 정지 버튼으로만.
  window.addEventListener('popstate', () => {
    if (session) {
      history.pushState({ app: true }, '');
      showControls();
      toast('끝내려면 ■ 정지를 눌러 주세요');
      return;
    }
    showScreen('library');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !session) return;
    updateBadge();
    const { current, duration } = player.position();
    updateProgress(current, duration);
  });
}

async function init() {
  player = createPlayer({
    audio: $('audio'),
    video: $('video'),
    lastAlertSrc: 'sounds/last.wav',
    doneAlertSrc: 'sounds/done.wav',
  });
  player.onEnded(onTrackEnded);
  player.onPlayingChange(onPlayingChange);
  player.onError(onPlaybackError);
  player.onTimeUpdate(updateProgress);
  bindEvents();
  $('desktop-notice').hidden = !looksLikeDesktopMode({
    innerWidth: window.innerWidth,
    screenWidth: window.screen.width,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  });
  try {
    store = await openStore();
  } catch {
    store = createMemoryStore();
    $('temp-notice').hidden = false;
  }
  lastUsed = await store.getLastUsed().catch(() => null);
  if (player.supportsVolume) {
    $('volume-row').hidden = false;
    const saved = await store.getVolume().catch(() => null);
    applyVolume(saved === null ? 100 : Math.round(saved * 100));
  }
  await refreshLibrary();
  showScreen('library');
}

init();
