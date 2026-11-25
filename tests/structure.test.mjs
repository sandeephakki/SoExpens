import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);
const importsOf = (file) => [...read(file).matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1]);

test('layer rules: ui -> bal/core only; bal -> bal/dal only; dal -> dal only', () => {
  for (const f of walk('ui')) for (const i of importsOf(f)) assert.ok(!i.includes('/dal/'), `${f} imports ${i}`);
  for (const f of walk('bal')) for (const i of importsOf(f)) assert.ok(!/\/(ui|core)\//.test(i), `${f} imports ${i}`);
  for (const f of walk('dal')) for (const i of importsOf(f)) assert.ok(!/\/(ui|bal|core)\//.test(i), `${f} imports ${i}`);
  for (const f of [...walk('bal'), ...walk('dal')]) assert.ok(!/\bdocument\.|\bwindow\./.test(read(f).replace(/\/\/.*$/gm, '')), `${f} touches DOM`);
});
test('every relative import resolves to a real file', () => {
  for (const f of [...walk('core'), ...walk('ui'), ...walk('bal'), ...walk('dal')]) for (const i of importsOf(f)) assert.ok(fs.existsSync(path.join(root, path.dirname(f), i)), `${f}: ${i}`);
});
test('service worker shell lists only files that exist, and covers every module', () => {
  const sw = read('sw.js');
  const list = [...sw.matchAll(/'([^']*)'/g)].map((m) => m[1]).filter((p) => /\.(js|css|json|html|png)$/.test(p));
  for (const p of list) assert.ok(fs.existsSync(path.join(root, p)), `missing ${p}`);
  for (const f of [...walk('core'), ...walk('ui'), ...walk('bal'), ...walk('dal')]) assert.ok(list.includes(f), `${f} not precached`);
});
test('every i18n key used in code exists in en.json; no unused junk keys for ui screens', () => {
  const en = JSON.parse(read('i18n/en.json'));
  const files = [...walk('core'), ...walk('ui')];
  const used = new Set();
  for (const f of files) for (const m of read(f).matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  for (const f of files) for (const m of read(f).matchAll(/'((?:status|dash|flat|set|form|export|months|toast|common|nav|app)\.[A-Za-z]+)'/g)) used.add(m[1]);
  for (const k of used) if (k !== 'key') assert.ok(k in en, `missing i18n key ${k}`);
});
test('every error code thrown in bal/dal has a friendly message', () => {
  const en = JSON.parse(read('i18n/en.json'));
  const codes = new Set();
  for (const f of [...walk('bal'), ...walk('dal')]) for (const m of read(f).matchAll(/Error\('([a-z_]+)'\)/g)) codes.add(m[1]);
  for (const role of ['owner', 'tenant']) for (const s of ['name_too_long', 'phone_invalid']) codes.add(`${role}_${s}`);
  for (const c of ['already_closed', 'already_open']) codes.add(c);
  for (const c of codes) assert.ok(`err.${c}` in en, `no message for ${c}`);
});
test('no innerHTML with dynamic data (only the static icon helper)', () => {
  for (const f of [...walk('core'), ...walk('ui')]) {
    const hits = read(f).split('\n').filter((l) => l.includes('.innerHTML'));
    if (f === 'core/dom.js') assert.equal(hits.length, 1); else assert.equal(hits.length, 0, f);
  }
});
test('manifest: relative start_url/scope and icons exist', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.start_url, './'); assert.equal(m.scope, './');
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(root, i.src)), i.src);
  assert.ok(!/href="\/|src="\//.test(read('index.html')), 'index.html must not use absolute paths (GitHub Pages subpath)');
});
