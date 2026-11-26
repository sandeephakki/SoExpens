import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('version in core/version.js equals the service worker cache version (so every deploy refreshes)', () => {
  const v = /APP_VERSION = '([^']+)'/.exec(read('core/version.js'))[1];
  const c = /CACHE_VERSION = 'soexpens-v([^']+)'/.exec(read('sw.js'))[1];
  assert.equal(c, v);
});
test('index.html applies the saved theme before the stylesheet, with the same key as theme.js', () => {
  const html = read('index.html');
  const key = /const KEY = '([^']+)'/.exec(read('core/theme.js'))[1];
  assert.ok(html.indexOf(key) > -1 && html.indexOf(key) < html.indexOf('css/app.css'));
});
test('css defines light, dark, and system-follows-phone palettes with matching variables', () => {
  const css = read('css/app.css');
  assert.ok(css.includes(':root[data-theme="dark"]') && css.includes(':root[data-theme="light"]') && css.includes(':root:not([data-theme="light"])'));
  const vars = (block) => [...block.matchAll(/--([a-z-]+):/g)].map((m) => m[1]).sort().join();
  const dark = /:root\[data-theme="dark"\] \{([^}]*)\}/.exec(css)[1];
  const sys = /:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/.exec(css)[1];
  assert.equal(vars(dark), vars(sys), 'explicit dark and system-dark must set the same variables');
});

function stubs(initial) {
  const store = new Map(Object.entries(initial || {}));
  const attrs = new Map(); const meta = { v: '', setAttribute(k, v) { if (k === 'content') this.v = v; } };
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  globalThis.document = { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) }, querySelector: () => meta };
  globalThis.matchMedia = (q) => ({ matches: globalThis.__dark === true, addEventListener() {} });
  return { store, attrs, meta };
}
test('theme: default is system, set/get/apply, bad values rejected, storage failure tolerated', async () => {
  const s = stubs(); globalThis.__dark = false;
  const th = await import('../core/theme.js');
  assert.equal(th.getTheme(), 'system');
  th.setTheme('dark'); assert.equal(th.getTheme(), 'dark'); assert.equal(s.attrs.get('data-theme'), 'dark'); assert.equal(s.meta.v, '#1e2226');
  th.setTheme('light'); assert.equal(s.attrs.get('data-theme'), 'light'); assert.equal(s.meta.v, '#0a6b5b');
  th.setTheme('system'); assert.equal(s.attrs.has('data-theme'), false);
  globalThis.__dark = true; th.applyTheme('system'); assert.equal(s.meta.v, '#1e2226', 'system follows a dark phone');
  assert.throws(() => th.setTheme('purple'), /bad_theme/); assert.throws(() => th.setTheme(null), /bad_theme/);
  s.store.set('soexpens-theme', 'garbage'); assert.equal(th.getTheme(), 'system');
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(th.getTheme(), 'system'); th.setTheme('dark'); assert.equal(s.attrs.get('data-theme'), 'dark', 'still applies for this session');
});
test('update check: unsupported, offline, found, current', async () => {
  const u = await import('../core/update.js');
  assert.equal(await u.checkForUpdate(), 'unsupported');
  u.setRegistration({ update: async () => { throw new Error('net'); } }); assert.equal(await u.checkForUpdate(), 'offline');
  u.setRegistration({ update: async () => {}, installing: {} }); assert.equal(await u.checkForUpdate(), 'found');
  u.setRegistration({ update: async () => {}, waiting: {} }); assert.equal(await u.checkForUpdate(), 'found');
  u.setRegistration({ update: async () => {}, installing: null, waiting: null }); assert.equal(await u.checkForUpdate(), 'current');
});
