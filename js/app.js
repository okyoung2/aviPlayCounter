import { openStore, createMemoryStore } from './store.js';
import { sortLibrary } from './library.js';
import { PRESETS, CORNERS, parseCustomCount, resolveSettings } from './settings.js';
import { formatElapsed } from './format.js';

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

// ---- 재생 (Task 8 에서 채움) ----

async function startPlayback(item, settings) {
  showScreen('player');
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
}

async function init() {
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
