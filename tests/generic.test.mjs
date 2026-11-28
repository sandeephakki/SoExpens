import test from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../bal/month-rules.js';
import * as svc from '../bal/service.js';
import { computeAll, collectionText, groupsText, collectionFromFlats } from '../bal/month-calc.js';
import { emptyDoc, migrate } from '../dal/migrate.js';
import { validateDoc } from '../bal/validate.js';
import { createMemoryStore } from '../dal/store.js';
import { sampleDoc, throwsCode } from './helpers.mjs';

const no = async (fn, code) => assert.equal(await throwsCode(fn, code), null);

test('a brand new society (no flats) works: collection 0, plain text', () => {
  const d = r.addMonth(emptyDoc(), '2026-01-05').doc;
  assert.equal(d.months[0].collection.amount, 0); assert.equal(collectionText(d.months[0]), 'Total collection');
});
test('collection text is built from the flats, never hardcoded', () => {
  assert.equal(groupsText(collectionFromFlats(sampleDoc().flats).groups), '12 flats x 2000 + Top Room - 750');
  const only = r.addFlatsBulk(emptyDoc(), { count: 6, prefix: 'B', start: 1, amount: 1500 });
  assert.equal(collectionFromFlats(only.flats).amount, 9000); assert.equal(groupsText(collectionFromFlats(only.flats).groups), '6 flats x 1500');
  let mixed = r.addFlat(only, { label: 'Shop', rate: 3000, owner: { name: '' } });
  mixed = r.addFlat(mixed, { label: 'Annex', rate: 500, owner: { name: '' } });
  assert.equal(groupsText(collectionFromFlats(mixed.flats).groups), '6 flats x 1500 + Shop - 3000 + Annex - 500');
  const zero = r.setRates(only, 'all', 0);
  assert.equal(collectionFromFlats(zero.flats).amount, 0);
});
test('deleting / editing flats changes the summary and NEW months, never existing months', () => {
  let d = sampleDoc();
  const top = d.flats.find((f) => f.label === 'Top Room');
  d = r.deleteFlat(d, top.id); d = r.deleteFlat(d, d.flats[0].id); d = r.deleteFlat(d, d.flats[0].id);
  assert.equal(collectionFromFlats(d.flats).amount, 10 * 2000);
  assert.equal(d.months[0].collection.amount, 24750); assert.equal(collectionText(d.months[0]), 'Total collection (12 flats x 2000 + Top Room - 750)');
  assert.equal(computeAll(d).get('2026-01').collection, 24750);
  d = r.addMonth(d, '2026-01-01').doc;
  assert.equal(d.months[1].collection.amount, 20000); assert.equal(collectionText(d.months[1]), 'Total collection (10 flats x 2000)');
});
test('recalcCollection: open month follows the flats on request; closed month refuses', async () => {
  let d = sampleDoc(); d = r.deleteFlat(d, d.flats.at(-1).id);
  assert.equal(d.months[0].collection.amount, 24750);
  const re = r.recalcCollection(d, '2026-01'); assert.equal(re.months[0].collection.amount, 24000); assert.equal(re.months[0].collection.source, 'computed');
  await no(() => r.recalcCollection(r.setStatus(d, '2026-01', 'closed'), '2026-01'), 'month_closed');
  await no(() => r.recalcCollection(d, '1999-01'), 'month_not_found');
});
test('setRates: all, selected, and every bad input', async () => {
  const d = sampleDoc(); const ids = d.flats.slice(0, 3).map((f) => f.id);
  const s = r.setRates(d, ids, '2,100'); assert.deepEqual(s.flats.slice(0, 3).map((f) => f.rate), [2100, 2100, 2100]); assert.equal(s.flats[3].rate, 2000);
  assert.ok(r.setRates(d, 'all', 5).flats.every((f) => f.rate === 5));
  await no(() => r.setRates(d, [], 5), 'nothing_selected'); await no(() => r.setRates(d, 'nope', 5), 'nothing_selected');
  await no(() => r.setRates(d, ['ghost'], 5), 'flat_not_found'); await no(() => r.setRates(d, 'all', ''), 'amount_required');
  await no(() => r.setRates(d, 'all', -1), 'amount_negative'); await no(() => r.setRates(d, 'all', 'abc'), 'amount_invalid');
  await no(() => r.setRates(emptyDoc(), 'all', 5), 'nothing_selected');
});
test('addFlatsBulk: labels, all-or-nothing on clash, and limits', async () => {
  const d = r.addFlatsBulk(emptyDoc(), { count: 3, prefix: 'A', start: 4, amount: 100 });
  assert.deepEqual(d.flats.map((f) => f.label), ['A4', 'A5', 'A6']);
  assert.deepEqual(r.addFlatsBulk(emptyDoc(), { count: 2, prefix: 'Flat ', start: '', amount: 1 }).flats.map((f) => f.label), ['Flat 1', 'Flat 2']);
  await no(() => r.addFlatsBulk(d, { count: 3, prefix: 'A', start: 6, amount: 100 }), 'label_duplicate');
  await no(() => r.addFlatsBulk(d, { count: 2, prefix: 'a', start: 5, amount: 100 }), 'label_duplicate');
  for (const c of [0, -1, 501, 1.5, 'x', '']) await no(() => r.addFlatsBulk(emptyDoc(), { count: c, prefix: 'A', start: 1, amount: 1 }), 'bulk_count_invalid');
  await no(() => r.addFlatsBulk(emptyDoc(), { count: 1, prefix: 'A', start: -1, amount: 1 }), 'bulk_start_invalid');
  await no(() => r.addFlatsBulk(emptyDoc(), { count: 1, prefix: 'x'.repeat(15), start: 1, amount: 1 }), 'bulk_prefix_invalid');
  await no(() => r.addFlatsBulk(emptyDoc(), { count: 1, prefix: 'x'.repeat(14), start: 100000, amount: 1 }), 'bulk_start_invalid');
  await no(() => r.addFlatsBulk(emptyDoc(), { count: 1, prefix: 'x'.repeat(14), start: 999999, amount: 1 }), 'bulk_start_invalid');
  await no(() => r.addFlatsBulk(emptyDoc(), { count: 1, prefix: 'A', start: 1, amount: '' }), 'amount_required');
  const big = r.addFlatsBulk(emptyDoc(), { count: 500, prefix: 'U', start: 1, amount: 1 });
  await no(() => r.addFlatsBulk(big, { count: 1, prefix: 'V', start: 1, amount: 1 }), 'too_many_flats');
  assert.equal(d.flats.length, 3, 'input untouched');
});
test('a flat needs an amount to be saved; blank / bad amounts rejected', async () => {
  await no(() => r.addFlat(emptyDoc(), { label: 'A1', rate: '', owner: { name: '' } }), 'amount_required');
  await no(() => r.addFlat(emptyDoc(), { label: 'A1', rate: '12.5', owner: { name: '' } }), 'amount_not_whole');
  assert.equal(r.addFlat(emptyDoc(), { label: 'A1', rate: '0', owner: { name: '' } }).flats[0].rate, 0);
});
test('v1 -> v2 migration keeps past months identical (amount and wording)', () => {
  const v1 = { app: 'SoExpens', schemaVersion: 1, settings: { societyName: 'Old', flatCount: 12, flatRate: 2000, roomRate: 750, startingSavings: 5 },
    flats: [{ id: 'a', label: 'F1', type: 'flat', rate: null, owner: { name: 'R', phone: '' }, tenant: null, history: [] }, { id: 'b', label: 'TOP', type: 'room', rate: null, owner: { name: '', phone: '' }, tenant: null, history: [] }],
    months: [{ id: '2026-01', status: 'closed', expenses: [], extraIncome: [], note: null, collection: { amount: 24750, source: 'computed', flats: 12, rate: 2000, roomRate: 750 } },
      { id: '2025-12', status: 'closed', expenses: [], extraIncome: [], note: null, collection: { amount: 21100, source: 'manual', note: '12 flats + Top Room' } }] };
  const v = validateDoc(v1); assert.ok(v.ok, v.errors.join()); const d = v.doc;
  assert.equal(d.schemaVersion, 3); assert.deepEqual(d.settings, { societyName: 'Old', startingSavings: 5, currency: 'INR' });
  assert.deepEqual(d.flats.map((f) => [f.label, f.rate]), [['F1', 2000], ['TOP', 750]]); assert.equal(d.flats[0].type, undefined);
  const jan = d.months.find((m) => m.id === '2026-01'); assert.equal(jan.collection.amount, 24750);
  assert.equal(collectionText(jan), 'Total collection (12 flats x 2000 + Top Room - 750)');
  assert.equal(collectionText(d.months.find((m) => m.id === '2025-12')), 'Total collection (12 flats + Top Room)');
});
test('migration edge cases: junk stays junk (validation rejects), newer versions refuse', () => {
  assert.throws(() => migrate({ app: 'SoExpens', schemaVersion: 4 }), /newer_version/);
  const v1 = { app: 'SoExpens', schemaVersion: 1, settings: null, flats: 'x', months: [] };
  assert.equal(validateDoc(v1).ok, false);
  const noRates = { app: 'SoExpens', schemaVersion: 1, settings: { societyName: 'S', startingSavings: 0 }, flats: [{ label: 'A', owner: { name: '' }, type: 'flat' }], months: [] };
  const ok = validateDoc(noRates); assert.ok(ok.ok); assert.equal(ok.doc.flats[0].rate, null, 'unknown rate stays "no amount"');
  const bad = validateDoc({ ...noRates, months: [{ id: '2026-01', status: 'open', expenses: [], extraIncome: [], collection: { amount: 5, source: 'computed', flats: 'x', rate: 1 } }] });
  assert.ok(bad.ok); assert.equal(bad.doc.months[0].collection.source, 'manual', 'unreadable breakdown falls back to manual, amount kept');
});
test('collection groups validation', () => {
  const mk = (g) => { const d = sampleDoc(); d.months[0].collection.groups = g; return validateDoc(d); };
  assert.ok(mk([{ count: 2, rate: 10 }]).ok);
  for (const g of [[{ count: 0, rate: 1 }], [{ count: 1.5, rate: 1 }], [{ count: 1, rate: -1 }], [{ count: 1, rate: 1, label: 5 }], 'x', [null], Array(51).fill({ count: 1, rate: 1 })]) assert.equal(mk(g).doc.months[0].collection.source, 'manual', JSON.stringify(g).slice(0, 40));
});
test('service: saved/unsaved tracking and summary stay in step with flats', async () => {
  const store = createMemoryStore(false); await store.set('doc', sampleDoc()); svc.setClock(() => new Date(2026, 9, 14, 9, 30)); await svc.init(store);
  assert.deepEqual(svc.getSummary(), { units: 13, monthly: 24750, noAmount: 0 });
  assert.equal(svc.getMeta().dirty, 0);
  await svc.removeFlat(svc.getDoc().flats.at(-1).id);
  assert.deepEqual(svc.getSummary(), { units: 12, monthly: 24000, noAmount: 0 });
  assert.equal(svc.getMeta().dirty, 1); assert.ok(svc.getMeta().lastSavedAt > 0);
  await svc.setRates('all', 0); assert.equal(svc.getSummary().noAmount, 12); assert.equal(svc.getSummary().monthly, 0);
  assert.equal(svc.getDoc().months[0].collection.amount, 24750, 'existing month untouched');
  svc.prepareBackup(); assert.equal(svc.getMeta().dirty, 2, 'making the file alone must not reset the counter'); await svc.markBackedUp(); assert.equal(svc.getMeta().dirty, 0);
  await svc.init(store); assert.equal(svc.getSummary().units, 12, 'survives reload'); assert.equal(svc.getMeta().dirty, 0);
  await svc.addMonth(); await svc.recalcCollection('2026-02'); assert.equal(svc.getDoc().months[1].collection.amount, 0);
});
test('importing an old v1 backup through the service works end to end', async () => {
  const store = createMemoryStore(false); svc.setClock(() => new Date(2026, 9, 14)); await svc.init(store);
  const v1 = { app: 'SoExpens', schemaVersion: 1, settings: { societyName: 'Legacy', flatCount: 12, flatRate: 2000, roomRate: 750, startingSavings: 0 }, flats: [],
    months: [{ id: '2026-01', status: 'closed', expenses: [{ id: 'x', details: 'A', amount: 5, date: null, repeat: false }], extraIncome: [], note: null, collection: { amount: 24750, source: 'computed', flats: 12, rate: 2000, roomRate: 750 } }] };
  const p = svc.previewImport(JSON.stringify(v1)); assert.ok(p.ok, p.errors && p.errors.join());
  await svc.applyImport(p.doc); assert.equal(svc.getDoc().schemaVersion, 3);
  assert.equal(svc.getMonthView('2026-01').collectionText, 'Total collection (12 flats x 2000 + Top Room - 750)');
  assert.equal(svc.getSummary().units, 0);
});
