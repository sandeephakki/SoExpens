import test from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../bal/month-rules.js';
import { computeAll } from '../bal/month-calc.js';
import { emptyDoc } from '../dal/migrate.js';
import { sampleDoc, throwsCode } from './helpers.mjs';

const no = async (fn, code) => assert.equal(await throwsCode(fn, code), null);

test('addMonth: first month uses today, then next month, copies only repeat items with blank amounts', () => {
  const d = sampleDoc();
  const { doc, id } = r.addMonth(d, '2026-02-01');
  assert.equal(id, '2026-02');
  const m = doc.months.find((x) => x.id === id);
  assert.deepEqual(m.expenses.map((e) => e.details), ['Salary', 'Water Bill']);
  assert.ok(m.expenses.every((e) => e.amount === null && e.repeat === true));
  assert.equal(m.collection.amount, 24750); assert.equal(m.collection.source, 'computed');
  assert.equal(d.months.length, 1, 'input doc not mutated');
});
test('addMonth negatives: duplicates blocked, year rollover, out of range', () => {
  let d = sampleDoc();
  d = r.addMonth(d, '2026-01-01').doc;           // 2026-02
  assert.equal(d.months.length, 2);
  const base = emptyDoc();
  base.months.push({ id: '2026-12', status: 'open', expenses: [], extraIncome: [], note: null, collection: { amount: 0, source: 'manual' } });
  assert.equal(r.addMonth(base, '2026-01-01').id, '2027-01');
  const far = emptyDoc();
  far.months.push({ id: '2099-12', status: 'open', expenses: [], extraIncome: [], note: null, collection: { amount: 0, source: 'manual' } });
  assert.throws(() => r.addMonth(far, '2026-01-01'), /month_out_of_range/);
});
test('collection snapshot: later amount change never rewrites old months', () => {
  let d = sampleDoc();
  d = r.setRates(d, 'all', 2500);
  assert.equal(d.months[0].collection.amount, 24750);
  d = r.addMonth(d, '2026-01-01').doc;
  assert.equal(d.months[1].collection.amount, 13 * 2500);
});
test('amount parsing: positives', () => {
  assert.equal(r.parseAmount('2,500'), 2500); assert.equal(r.parseAmount(' 7 '), 7); assert.equal(r.parseAmount(0), 0);
  assert.equal(r.parseAmount('12.0'), 12); assert.equal(r.parseAmount('', { allowBlank: true }), null); assert.equal(r.parseAmount(9999999), 9999999);
});
test('amount parsing: negatives', () => {
  const bad = { '': 'amount_required', null: 'amount_required', abc: 'amount_invalid', '1e3': 'amount_invalid', '12.5': 'amount_not_whole', '-5': 'amount_negative', '10000000': 'amount_too_big', 'Infinity': 'amount_invalid', '0x10': 'amount_invalid', '1 2': 'amount_invalid' };
  for (const [v, code] of Object.entries(bad)) assert.throws(() => r.parseAmount(v === 'null' ? null : v), new RegExp(code), `value ${JSON.stringify(v)}`);
  assert.throws(() => r.parseAmount(NaN), /amount_invalid/); assert.throws(() => r.parseAmount(-1), /amount_negative/); assert.throws(() => r.parseAmount({}), /amount_invalid/);
});
test('details parsing', () => {
  assert.equal(r.parseDetails('  a   b  '), 'a b');
  assert.throws(() => r.parseDetails('   '), /details_required/); assert.throws(() => r.parseDetails(null), /details_required/);
  assert.throws(() => r.parseDetails('x'.repeat(61)), /details_too_long/); assert.equal(r.parseDetails('x'.repeat(60)).length, 60);
});
test('addItem: positive, then every negative path', async () => {
  const d = sampleDoc();
  const d2 = r.addItem(d, '2026-01', 'expenses', { details: 'Paint', amount: '1,200', date: '2026-01-15' });
  assert.equal(d2.months[0].expenses.at(-1).amount, 1200);
  await no(() => r.addItem(d, '2026-01', 'expenses', { details: '', amount: 5 }), 'details_required');
  await no(() => r.addItem(d, '2026-01', 'expenses', { details: 'a', amount: '' }), 'amount_required');
  await no(() => r.addItem(d, '2026-01', 'expenses', { details: 'a', amount: -3 }), 'amount_negative');
  await no(() => r.addItem(d, '2026-01', 'expenses', { details: 'a', amount: 5, date: '15/01/2026' }), 'date_invalid');
  await no(() => r.addItem(d, '2030-01', 'expenses', { details: 'a', amount: 5 }), 'month_not_found');
  await no(() => r.addItem(d, '2026-01', 'weird', { details: 'a', amount: 5 }), 'bad_kind');
});
test('closed months reject every edit; unlock allows it again', async () => {
  let d = r.setStatus(sampleDoc(), '2026-01', 'closed');
  const id = d.months[0].expenses[0].id;
  await no(() => r.addItem(d, '2026-01', 'expenses', { details: 'a', amount: 5 }), 'month_closed');
  await no(() => r.updateItem(d, '2026-01', 'expenses', id, { amount: 1 }), 'month_closed');
  await no(() => r.deleteItem(d, '2026-01', 'expenses', id), 'month_closed');
  await no(() => r.updateMonthMeta(d, '2026-01', { note: 'x' }), 'month_closed');
  await no(() => r.setStatus(d, '2026-01', 'closed'), 'already_closed');
  d = r.setStatus(d, '2026-01', 'open');
  await no(() => r.setStatus(d, '2026-01', 'open'), 'already_open');
  assert.equal(r.updateItem(d, '2026-01', 'expenses', id, { amount: 1 }).months[0].expenses[0].amount, 1);
});
test('updateItem: partial updates, blank = pending for expenses only, unknown id', async () => {
  const d = sampleDoc(); const id = d.months[0].expenses[0].id;
  assert.equal(r.updateItem(d, '2026-01', 'expenses', id, { amount: '' }).months[0].expenses[0].amount, null);
  assert.equal(r.updateItem(d, '2026-01', 'expenses', id, { repeat: false }).months[0].expenses[0].repeat, false);
  assert.equal(r.updateItem(d, '2026-01', 'expenses', id, { details: 'New' }).months[0].expenses[0].amount, 10000);
  await no(() => r.updateItem(d, '2026-01', 'expenses', 'nope', { amount: 1 }), 'item_not_found');
  const e = r.addItem(d, '2026-01', 'extraIncome', { details: 'Interest', amount: 100 });
  const xid = e.months[0].extraIncome[0].id;
  await no(() => r.updateItem(e, '2026-01', 'extraIncome', xid, { amount: '' }), 'amount_required');
});
test('deleteItem: removes only that item; unknown id errors', async () => {
  const d = sampleDoc(); const id = d.months[0].expenses[1].id;
  const d2 = r.deleteItem(d, '2026-01', 'expenses', id);
  assert.equal(d2.months[0].expenses.length, 2); assert.ok(!d2.months[0].expenses.some((e) => e.id === id));
  await no(() => r.deleteItem(d, '2026-01', 'expenses', 'nope'), 'item_not_found');
});
test('extra income adds to savings; adjustment flag kept', () => {
  let d = sampleDoc();
  d = r.addItem(d, '2026-01', 'extraIncome', { details: 'Adj', amount: 600, adjustment: true });
  assert.equal(d.months[0].extraIncome[0].kind, 'adjustment');
  assert.equal(computeAll(d).get('2026-01').closing, 10250 + 600);
});
test('editing an old month cascades into every later month', () => {
  let d = sampleDoc();
  d = r.addMonth(d, '2026-01-01').doc; d = r.addMonth(d, '2026-01-01').doc;
  const before = computeAll(d).get('2026-03').opening;
  d = r.updateItem(d, '2026-01', 'expenses', d.months[0].expenses[0].id, { amount: 9400 });
  assert.equal(computeAll(d).get('2026-03').opening, before + 600);
});
test('deficit month reduces savings; surplus adds (the rule you asked for)', () => {
  let d = emptyDoc(); d.settings.startingSavings = 41933;
  d = r.addFlatsBulk(d, { count: 12, prefix: 'Flat ', start: 1, amount: 2000 });
  d = r.addFlat(d, { label: 'Top Room', rate: 750, owner: { name: '' } });
  d = r.addMonth(d, '2026-10-01').doc;
  d = r.addItem(d, '2026-10', 'expenses', { details: 'Big', amount: 31588 });
  const c = computeAll(d).get('2026-10');
  assert.equal(c.balance, -6838); assert.equal(c.closing, 35095);
});
test('updateMonthMeta: collection override turns manual; note trimmed/cleared/limited', async () => {
  const d = sampleDoc();
  const a = r.updateMonthMeta(d, '2026-01', { collectionAmount: '20,400', note: '  hello   world ' });
  assert.equal(a.months[0].collection.amount, 20400); assert.equal(a.months[0].collection.source, 'manual'); assert.equal(a.months[0].note, 'hello world');
  assert.equal(r.updateMonthMeta(a, '2026-01', { note: '   ' }).months[0].note, null);
  const same = r.updateMonthMeta(d, '2026-01', { collectionAmount: '24750' });
  assert.equal(same.months[0].collection.source, 'computed', 'unchanged amount keeps computed');
  await no(() => r.updateMonthMeta(d, '2026-01', { note: 'x'.repeat(501) }), 'note_too_long');
  await no(() => r.updateMonthMeta(d, '2026-01', { collectionAmount: 'abc' }), 'amount_invalid');
});
test('updateSettings validation', async () => {
  const d = emptyDoc(); const ok = { societyName: 'A', startingSavings: 0 };
  assert.equal(r.updateSettings(d, ok).settings.societyName, 'A');
  assert.equal(r.updateSettings(d, { ...ok, startingSavings: '-500' }).settings.startingSavings, -500);
  await no(() => r.updateSettings(d, { ...ok, societyName: '  ' }), 'society_required');
  await no(() => r.updateSettings(d, { ...ok, societyName: 'x'.repeat(61) }), 'society_too_long');
  await no(() => r.updateSettings(d, { ...ok, startingSavings: 'x' }), 'starting_invalid');
  await no(() => r.updateSettings(d, { ...ok, startingSavings: '1.5' }), 'starting_invalid');
});
test('flats: add/edit/delete, duplicate labels, phone rules, history on change', async () => {
  let d = emptyDoc();
  d = r.addFlat(d, { label: 'A1', rate: 2000, owner: { name: 'Ravi', phone: '98 765-43210' }, tenant: null });
  assert.equal(d.flats.length, 1);
  await no(() => r.addFlat(d, { label: 'a1', rate: 1, owner: { name: 'X' } }), 'label_duplicate');
  await no(() => r.addFlat(d, { label: '', rate: 1, owner: { name: 'X' } }), 'label_required');
  await no(() => r.addFlat(d, { label: 'x'.repeat(21), rate: 1 }), 'label_too_long');
  await no(() => r.addFlat(d, { label: 'B1', rate: 1, owner: { name: 'X', phone: 'call me' } }), 'owner_phone_invalid');
  await no(() => r.addFlat(d, { label: 'B1', rate: 1, owner: { name: 'n'.repeat(61) } }), 'owner_name_too_long');
  await no(() => r.addFlat(d, { label: 'B1', rate: 1, tenant: { name: 'T', phone: 'abc' } }), 'tenant_phone_invalid');
  const id = d.flats[0].id;
  let e = r.updateFlat(d, id, { label: 'A1', rate: 2000, owner: { name: 'Ravi', phone: '1' }, tenant: { name: 'Sunita', phone: '2' } }, '2026-02-01');
  assert.equal(e.flats[0].history.length, 0, 'adding first tenant is not history');
  e = r.updateFlat(e, id, { label: 'A1', rate: 2000, owner: { name: 'Ravi', phone: '1' }, tenant: { name: 'Arun', phone: '3' } }, '2026-03-01');
  assert.deepEqual(e.flats[0].history.map((h) => [h.role, h.name, h.until]), [['tenant', 'Sunita', '2026-03-01']]);
  e = r.updateFlat(e, id, { label: 'A1', rate: 2000, owner: { name: 'Meena', phone: '' }, tenant: null }, '2026-04-01');
  assert.deepEqual(e.flats[0].history.map((h) => h.name), ['Sunita', 'Ravi', 'Arun']);
  assert.equal(e.flats[0].tenant, null);
  await no(() => r.updateFlat(e, 'nope', { label: 'Z', rate: 1 }, '2026-01-01'), 'flat_not_found');
  assert.equal(r.updateFlat(e, id, { label: 'A1', rate: 2000, owner: { name: 'Meena' } }, '2026-05-01').flats[0].label, 'A1', 'own label is not a duplicate');
  assert.equal(r.deleteFlat(e, id).flats.length, 0);
  await no(() => r.deleteFlat(e, 'nope'), 'flat_not_found');
});
