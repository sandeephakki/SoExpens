import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shareTargets, appUrl, nativeShare, copyText, FALLBACK_URL } from '../core/share.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const URL1 = 'https://sandeephakki.github.io/SoExpens/';
const TEXT = 'SoExpens: a simple, free tracker & more? #apartments "quoted" 100% — नमस्ते 🚀\nline two';
const TITLE = 'SoExpens - apartment expense tracker';

test('every share link round-trips the url/text exactly (nothing breaks on & # ? % quotes, newlines, Hindi, emoji)', () => {
  const targets = shareTargets(URL1, TEXT, TITLE);
  assert.deepEqual(targets.map((t) => t.id), ['whatsapp', 'telegram', 'facebook', 'x', 'linkedin', 'email', 'sms']);
  const by = Object.fromEntries(targets.map((t) => [t.id, t.href]));
  const q = (href, key) => new URL(href.replace(/^mailto:/, 'https://m.invalid/').replace(/^sms:/, 'https://s.invalid/')).searchParams.get(key);
  assert.equal(q(by.whatsapp, 'text'), `${TEXT} ${URL1}`);
  assert.equal(q(by.telegram, 'url'), URL1); assert.equal(q(by.telegram, 'text'), TEXT);
  assert.equal(q(by.facebook, 'u'), URL1);
  assert.equal(q(by.x, 'url'), URL1); assert.equal(q(by.x, 'text'), TEXT);
  assert.equal(q(by.linkedin, 'url'), URL1);
  assert.equal(q(by.email, 'subject'), TITLE); assert.equal(q(by.email, 'body'), `${TEXT}\n\n${URL1}`);
  assert.equal(q(by.sms, 'body'), `${TEXT} ${URL1}`);
  assert.ok(by.email.startsWith('mailto:?') && by.sms.startsWith('sms:?&body='));
  for (const t of targets) { assert.ok(!/\s/.test(t.href), `${t.id} contains raw whitespace`); if (!/^(mailto|sms):/.test(t.href)) assert.ok(t.href.startsWith('https://'), t.id); }
});
test('a url with its own query/hash characters stays one parameter', () => {
  const u = 'https://example.com/app/?a=1&b=2#frag'; const by = Object.fromEntries(shareTargets(u, 't', 's').map((t) => [t.id, t.href]));
  assert.equal(new URL(by.facebook).searchParams.get('u'), u); assert.equal(new URL(by.telegram).searchParams.get('url'), u);
});
test('appUrl: folder of the running app, no hash/query; file:// and no-browser fall back', () => {
  const set = (href) => { globalThis.location = { href }; };
  set('https://u.github.io/SoExpens/index.html#months?x=1'); assert.equal(appUrl(), 'https://u.github.io/SoExpens/');
  set('https://u.github.io/SoExpens/#settings'); assert.equal(appUrl(), 'https://u.github.io/SoExpens/');
  set('https://soexpens.example.com/?utm=1'); assert.equal(appUrl(), 'https://soexpens.example.com/');
  set('http://localhost:8765/index.html'); assert.equal(appUrl(), 'http://localhost:8765/');
  set('file:///C:/x/index.html'); assert.equal(appUrl(), FALLBACK_URL);
  set('not a url'); assert.equal(appUrl(), FALLBACK_URL);
  delete globalThis.location; assert.equal(appUrl(), FALLBACK_URL);
  assert.ok(/^https:\/\//.test(FALLBACK_URL) && FALLBACK_URL.endsWith('/'));
});
test('nativeShare: unsupported, shared (with the right payload), cancelled, other errors', async () => {
  delete globalThis.navigator; assert.equal(await nativeShare({ title: 'a', text: 'b', url: 'c' }), 'unsupported');
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true }); assert.equal(await nativeShare({}), 'unsupported');
  let got; globalThis.navigator = { share: async (d) => { got = d; } };
  assert.equal(await nativeShare({ title: 'T', text: 'X', url: 'U' }), 'shared'); assert.deepEqual(got, { title: 'T', text: 'X', url: 'U' });
  globalThis.navigator = { share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } }; assert.equal(await nativeShare({}), 'cancelled');
  globalThis.navigator = { share: async () => { throw new Error('NotAllowedError'); } }; assert.equal(await nativeShare({}), 'unsupported');
});
test('copyText: clipboard, fallback to execCommand, and failure', async () => {
  let copied = null; globalThis.navigator = { clipboard: { writeText: async (t) => { copied = t; } } };
  assert.equal(await copyText('hello'), true); assert.equal(copied, 'hello');
  const ta = { setAttribute() {}, style: {}, select() {}, setSelectionRange() {}, remove() {}, value: '' }; let cmd = null;
  globalThis.document = { createElement: () => ta, body: { append() {} }, execCommand: (c) => { cmd = c; return true; } };
  globalThis.navigator = { clipboard: { writeText: async () => { throw new Error('denied'); } } };
  assert.equal(await copyText('fallback'), true); assert.equal(cmd, 'copy'); assert.equal(ta.value, 'fallback');
  globalThis.navigator = {}; globalThis.document = { createElement: () => ta, body: { append() {} }, execCommand: () => false }; assert.equal(await copyText('x'), false);
  delete globalThis.document; assert.equal(await copyText('x'), false);
});
test('about card: author links are the real ones, open safely, and every share label + image exists', () => {
  const src = read('ui/about.js'); const en = JSON.parse(read('i18n/en.json'));
  for (const u of ['https://www.hakki.in/', 'https://hakki.in/#store', 'https://www.linkedin.com/in/sandeep-s-hakki-83174022/', 'mailto:sandeep@hakki.in']) assert.ok(src.includes(u), u);
  assert.equal((src.match(/target: '_blank'/g) || []).length, (src.match(/rel: 'noopener noreferrer'/g) || []).length, 'every new-tab link needs rel=noopener noreferrer');
  for (const id of shareTargets('u', 't', 's').map((t) => t.id)) assert.ok(`share.${id}` in en, `share.${id}`);
  for (const f of ['img/author-160.png', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/apple-touch-icon.png', 'img/favicon-32.png']) assert.ok(fs.existsSync(path.join(root, f)), f);
  assert.ok(!/innerHTML/.test(src));
  const html = read('index.html'); assert.ok(html.includes('og:title') && html.includes('apple-touch-icon.png') && html.includes('favicon-32.png'));
});
test('settings puts About LAST, after the other cards', () => {
  const s = read('ui/settings.js'); assert.ok(/appCard\(\)\), aboutCard\(\)\)/.test(s));
});

test('css: plain-link buttons use the app text colour, not browser blue', () => {
  assert.ok(/a\.btn \{[^}]*color:\s*var\(--ink\)/.test(read('css/app.css')));
});
