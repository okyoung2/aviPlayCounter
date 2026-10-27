import { openStore, createMemoryStore } from './store.js';
import { sortLibrary } from './library.js';
import { PRESETS, CORNERS, parseCustomCount, resolveSettings, targetOf } from './settings.js';
import { formatElapsed } from './format.js';
import { createPlayer } from './player.js';
import { createCounter } from './counter.js';
import { createStopwatch } from './stopwatch.js';

const $ = (id) => document.getElementById(id);
const CORNER_LABELS = { 'top-left': '↖', 'top-right': '↗', 'bottom-left': '↙', 'bottom-right': '↘' };
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

let toastTimer = null;
function toast(lines) {
  const text = [].concat(lines).filter(Boolean).join('\n');
  if (!text) return;
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
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
    if (item.favorite) {
      li.append(el('button', {
        class: 'primary quick', type: 'button', onclick: () => quickPlay(item),
      }, '▶ 바로 재생'));
    }
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
  toast('파일을 추가하는 중이에요…');
  const r = await store.addFiles(files);
  await refreshLibrary();
  toast([r.added.length ? `${r.added.length}개 추가했어요.` : '', ...r.skipped, ...r.failed]);
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
  showScreen('setup');
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

  $('corner-chips').replaceChildren(...CORNERS.map((c) => chip(CORNER_LABELS[c], draft.corner === c, () => {
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

const progressText = (counter) =>
  `${counter.current} / ${counter.target === Infinity ? '∞' : counter.target}`;

function updateBadge() {
  if (!session) return;
  $('badge-count').textContent = progressText(session.counter);
  $('badge-time').textContent = formatElapsed(session.stopwatch.elapsedMs());
}

function showControls() {
  $('controls').hidden = false;
  clearTimeout(controlsTimer);
  // 일시정지 중에는 계속 보여 준다.
  if (session?.playing) controlsTimer = setTimeout(() => { $('controls').hidden = true; }, CONTROLS_HIDE_MS);
}

function hideControls() {
  clearTimeout(controlsTimer);
  $('controls').hidden = true;
}

async function startPlayback(item, settings) {
  // 터치 처리 중에 먼저 불러서, 화면이 꺼진 뒤에도 알림음이 울리게 한다.
  const primed = player.primeAlerts();
  if (session) finish(false, { silent: true });
  try {
    await player.load(await store.getBlob(item.id), item.kind);
  } catch {
    player.stop();
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
  showScreen('player');
  history.pushState({ screen: 'player' }, '');

  const step = counter.start();
  if (step.lastRound && settings.lastAlert) player.playAlert('last');
  player.setNowPlaying(item.name, progressText(counter));
  updateBadge();
  try {
    await player.play();
  } catch {
    showControls(); // 자동 재생이 막히면 ▶ 재개 버튼으로 시작한다.
  }
}

function onTrackEnded() {
  if (!session) return;
  const { counter, settings, item } = session;
  const step = counter.trackEnded();
  if (step.action === 'play') {
    if (step.lastRound && settings.lastAlert) player.playAlert('last');
    player.restart();
    player.setNowPlaying(item.name, progressText(counter));
    updateBadge();
  } else if (step.complete) {
    if (settings.doneAlert) player.playAlert('done');
    finish(true);
  }
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
  $('result-count').textContent = completed ? `${s.counter.target}회 완료` : `${s.counter.completed}회 재생`;
  $('result-time').textContent = `걸린 시간 ${formatElapsed(s.stopwatch.elapsedMs())}`;
  $('result-name').textContent = s.item.name;
  showScreen('result');
}

// ---- 시작 ----

function bindEvents() {
  $('add-btn').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    addFiles(files);
  });
  $('back-btn').addEventListener('click', () => showScreen('library'));
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
  $('pause-btn').addEventListener('click', () => {
    if (!session) return;
    if (session.playing) player.pause();
    else player.play().catch(() => {});
  });
  $('stop-btn').addEventListener('click', () => { if (session) finish(false); });
  $('again-btn').addEventListener('click', () => {
    if (lastSession) startPlayback(lastSession.item, lastSession.settings);
  });
  $('home-btn').addEventListener('click', () => showScreen('library'));

  // 재생 중 뒤로 가기는 정지와 같다. 결과 화면에서 뒤로 가면 목록으로.
  window.addEventListener('popstate', () => {
    if (session) finish(false);
    else if (!$('screen-result').hidden) showScreen('library');
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateBadge(); });
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
  bindEvents();
  try {
    store = await openStore();
  } catch {
    store = createMemoryStore();
    $('temp-notice').hidden = false;
  }
  lastUsed = await store.getLastUsed().catch(() => null);
  await refreshLibrary();
  showScreen('library');
}

init();
