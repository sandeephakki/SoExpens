// dal/store.js — the only file that knows where data physically lives.
// Interface: get(key), set(key, value), remove(key). Values are plain JSON objects.

const DB_NAME = 'soexpens';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb_open_failed'));
    req.onblocked = () => reject(new Error('idb_blocked'));
  });
}

function run(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error || new Error('idb_tx_failed'));
    tx.onabort = () => reject(tx.error || new Error('idb_tx_aborted'));
  });
}

export function createIdbStore() {
  let dbp = null;
  const db = () => (dbp ||= openDb());
  return {
    volatile: false,
    async get(key) {
      const d = await db();
      const v = await run(d, 'readonly', (s) => s.get(key));
      return v === undefined ? null : v;
    },
    async set(key, value) {
      const d = await db();
      await run(d, 'readwrite', (s) => s.put(value, key));
    },
    async remove(key) {
      const d = await db();
      await run(d, 'readwrite', (s) => s.delete(key));
    },
  };
}

export function createMemoryStore(volatile = true) {
  const m = new Map();
  return {
    volatile,
    async get(key) { return m.has(key) ? structuredClone(m.get(key)) : null; },
    async set(key, value) { m.set(key, structuredClone(value)); },
    async remove(key) { m.delete(key); },
  };
}

// IndexedDB when available; otherwise a memory store flagged volatile
// so the UI can warn that data will vanish on reload.
export function createDefaultStore() {
  if (typeof indexedDB === 'undefined') return createMemoryStore(true);
  return createIdbStore();
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* not critical */ }
  return false;
}
