// IndexedDB 저장소: 목록 정보(items), 파일 내용(blobs), 기타 값(meta).
import { kindOf, isDuplicate, describeAddError } from './library.js';

const VERSION = 1;

const req2promise = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const txDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
});

// 메타데이터로 길이(초)를 구한다. 못 구하면 null.
function probeDuration(file, kind) {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const finish = (value) => {
      clearTimeout(timer);
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 5000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => finish(null);
    el.src = url;
  });
}

// 파일마다 검사하고 save(item, file) 로 저장한다. 한 파일의 실패가 나머지를 막지 않는다.
async function addFilesWith(files, existing, save) {
  const result = { added: [], skipped: [], failed: [] };
  for (const file of files) {
    const kind = kindOf(file.type, file.name);
    if (!kind) {
      result.failed.push(`"${file.name}"은(는) 동영상/음성 파일이 아니에요.`);
      continue;
    }
    if (isDuplicate(existing, file)) {
      result.skipped.push(`이미 목록에 있어요: ${file.name}`);
      continue;
    }
    const item = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      kind,
      durationSec: await probeDuration(file, kind),
      favorite: false,
      addedAt: Date.now(),
      settings: null,
    };
    try {
      await save(item, file);
      existing.push(item);
      result.added.push(item);
    } catch (err) {
      result.failed.push(describeAddError(err, file.name));
    }
  }
  return result;
}

// 저장소를 열 수 없을 때 쓰는 임시 저장소. 같은 API, 메모리에만 보관.
export function createMemoryStore() {
  const items = new Map();
  const blobs = new Map();
  let lastUsed = null;
  return {
    async listItems() { return [...items.values()].map((it) => ({ ...it })); },
    addFiles(files) {
      return addFilesWith(files, [...items.values()], async (item, file) => {
        items.set(item.id, item);
        blobs.set(item.id, file);
      });
    },
    async updateItem(id, patch) {
      const current = items.get(id);
      if (!current) throw new Error(`no item ${id}`);
      const next = { ...current, ...patch, id };
      items.set(id, next);
      return next;
    },
    async removeItem(id) { items.delete(id); blobs.delete(id); },
    async getBlob(id) {
      const blob = blobs.get(id);
      if (!blob) throw new Error(`no blob ${id}`);
      return blob;
    },
    async getLastUsed() { return lastUsed; },
    async setLastUsed(settings) { lastUsed = settings; },
    close() {},
  };
}

export async function openStore(dbName = 'mantra-player') {
  const open = indexedDB.open(dbName, VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore('items', { keyPath: 'id' });
    db.createObjectStore('blobs');
    db.createObjectStore('meta');
  };
  const db = await req2promise(open);

  const get = (storeName, key) =>
    req2promise(db.transaction(storeName).objectStore(storeName).get(key));

  const listItems = () => req2promise(db.transaction('items').objectStore('items').getAll());

  return {
    listItems,

    async addFiles(files) {
      if (files.length && navigator.storage?.persisted && !(await navigator.storage.persisted())) {
        navigator.storage.persist?.().catch(() => {});
      }
      return addFilesWith(files, await listItems(), async (item, file) => {
        const tx = db.transaction(['items', 'blobs'], 'readwrite');
        tx.objectStore('items').put(item);
        tx.objectStore('blobs').put(file, item.id);
        await txDone(tx);
      });
    },

    async updateItem(id, patch) {
      const tx = db.transaction('items', 'readwrite');
      const items = tx.objectStore('items');
      const current = await req2promise(items.get(id));
      if (!current) throw new Error(`no item ${id}`);
      const next = { ...current, ...patch, id };
      items.put(next);
      await txDone(tx);
      return next;
    },

    async removeItem(id) {
      const tx = db.transaction(['items', 'blobs'], 'readwrite');
      tx.objectStore('items').delete(id);
      tx.objectStore('blobs').delete(id);
      await txDone(tx);
    },

    async getBlob(id) {
      const blob = await get('blobs', id);
      if (!blob) throw new Error(`no blob ${id}`);
      return blob;
    },

    async getLastUsed() {
      return (await get('meta', 'lastUsed')) ?? null;
    },

    async setLastUsed(settings) {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(settings, 'lastUsed');
      await txDone(tx);
    },

    close() {
      db.close();
    },
  };
}
