import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDoc } from '../bal/validate.js';
import { parseBackupText, toBackupText } from '../dal/backup.js';
import { sampleDoc } from './helpers.mjs';

const good = () => structuredClone(sampleDoc());
const bad = (mutate) => { const d = good(); mutate(d); return validateDoc(d); };
const has = (res, frag) => !res.ok && res.errors.some((e) => e.includes(frag));

test('a valid doc passes, round-trips through backup text, and drops unknown / underscore keys', () => {
  const d = good(); d._expected = { x: 1 }; d._meta = 'hi'; d.extra = 1; d.months[0]._expected = { closing: 1 }; d.months[0].junk = 1;
  const v = validateDoc(JSON.parse(toBackupText(d)));
  assert.ok(v.ok, v.errors.join());
  assert.equal(v.doc._expected, undefined); assert.equal(v.doc.extra, undefined); assert.equal(v.doc.months[0].junk, undefined); assert.equal(v.doc.months[0]._expected, undefined);
  assert.deepEqual(validateDoc(v.doc).doc, v.doc, 'idempotent');
});
test('non-objects and wrong app / versions', () => {
  for (const x of [null, undefined, 5, 'str', [], true]) assert.equal(validateDoc(x).ok, false);
  assert.deepEqual(validateDoc({}).errors, ['wrong_app']);
  assert.deepEqual(bad((d) => { d.app = 'Other'; }).errors, ['wrong_app']);
  assert.deepEqual(bad((d) => { d.schemaVersion = 99; }).errors, ['newer_version']);
  for (const v of [0, -1, 1.5, '1', null, undefined]) assert.deepEqual(bad((d) => { d.schemaVersion = v; }).errors, ['bad_version']);
});
test('settings negatives', () => {
  assert.ok(has(bad((d) => { d.settings.societyName = ''; }), 'bad_society_name'));
  assert.ok(has(bad((d) => { d.settings.societyName = 'x'.repeat(61); }), 'bad_society_name'));
  assert.ok(has(bad((d) => { d.settings.startingSavings = 'x'; }), 'bad_starting_savings'));
  assert.equal(bad((d) => { delete d.settings; }).ok, false);
});
test('structure negatives', () => {
  assert.ok(has(bad((d) => { d.months = {}; }), 'bad_months'));
  assert.ok(has(bad((d) => { d.flats = 'x'; }), 'bad_flats'));
  assert.ok(has(bad((d) => { d.months.push(structuredClone(d.months[0])); }), 'duplicate_month'));
  assert.ok(has(bad((d) => { d.months[0].id = '2026-13'; }), 'bad_id'));
  assert.ok(has(bad((d) => { d.months[0].id = 5; }), 'bad_id'));
  assert.ok(has(bad((d) => { d.months[0].status = 'weird'; }), 'bad_status'));
  assert.ok(has(bad((d) => { d.months[0].collection = null; }), 'bad_collection'));
  assert.ok(has(bad((d) => { d.months[0].collection.amount = -1; }), 'bad_collection'));
  assert.ok(has(bad((d) => { d.months[0].collection.amount = '5'; }), 'bad_collection'));
  assert.ok(has(bad((d) => { d.months[0].expenses = 'x'; }), 'expenses_not_array'));
  assert.ok(has(bad((d) => { d.months[0].note = 5; }), 'bad_note'));
  assert.ok(has(bad((d) => { d.months[0].note = 'x'.repeat(501); }), 'bad_note'));
  assert.ok(has(bad((d) => { d.months.push(null); }), 'bad_month'));
});
test('item negatives', () => {
  const e = (f) => bad((d) => f(d.months[0].expenses[0]));
  assert.ok(has(e((x) => { x.details = ''; }), 'bad_details'));
  assert.ok(has(e((x) => { x.details = 'x'.repeat(61); }), 'bad_details'));
  assert.ok(has(e((x) => { x.details = 5; }), 'bad_details'));
  assert.ok(has(e((x) => { x.amount = -5; }), 'bad_amount'));
  assert.ok(has(e((x) => { x.amount = 1.5; }), 'bad_amount'));
  assert.ok(has(e((x) => { x.amount = '100'; }), 'bad_amount'));
  assert.ok(has(e((x) => { x.amount = 1e12; }), 'bad_amount'));
  assert.ok(has(e((x) => { x.amount = NaN; }), 'bad_amount'));
  assert.ok(has(e((x) => { x.date = '15/01/2026'; }), 'bad_date'));
  assert.ok(has(bad((d) => { d.months[0].expenses.push(null); }), 'bad_item'));
  assert.ok(has(bad((d) => { d.months[0].extraIncome = [{ details: 'x', amount: null }]; }), 'bad_amount'), 'extra income cannot be pending');
});
test('pending expense (null amount) is valid; missing ids get generated; duplicate ids made unique', () => {
  const ok = bad((d) => { d.months[0].expenses[0].amount = null; delete d.months[0].expenses[1].id; d.months[0].expenses[2].id = d.months[0].expenses[0].id; });
  assert.ok(ok.ok); const ids = ok.doc.months[0].expenses.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length); assert.equal(ok.doc.months[0].expenses[0].amount, null);
});
test('flats negatives', () => {
  const f = (o) => bad((d) => d.flats.push({ id: 'f', label: 'A1', owner: { name: 'N', phone: '' }, tenant: null, history: [], ...o }));
  assert.ok(f({}).ok);
  assert.ok(has(f({ label: '' }), 'bad_label'));
  assert.ok(has(f({ owner: { name: 'N', phone: 'abc' } }), 'bad_phone'));
  assert.ok(has(f({ tenant: 5 }), 'bad_person'));
  assert.ok(has(f({ history: 'x' }), 'bad_history'));
  assert.ok(has(f({ rate: -1 }), 'bad_rate'));
  assert.ok(has(f({ rate: 1.5 }), 'bad_rate'));
  assert.ok(has(f({ rate: '2000' }), 'bad_rate'));
  assert.ok(has(bad((d) => { d.flats.push({ label: 'a1', owner: { name: '', phone: '' } }, { label: 'A1', owner: { name: '', phone: '' } }); }), 'duplicate_label'));
});
test('limits: too many months / items are rejected', () => {
  assert.ok(has(bad((d) => { d.months = Array.from({ length: 601 }, (_, i) => ({ id: `2026-01` })); }), 'bad_months'));
  assert.ok(has(bad((d) => { d.months[0].expenses = Array.from({ length: 501 }, () => ({ details: 'x', amount: 1 })); }), 'too_many'));
});
test('hostile text stays text (no markup interpretation happens at this layer)', () => {
  const v = bad((d) => { d.months[0].expenses[0].details = '<img src=x onerror=alert(1)>'; });
  assert.ok(v.ok); assert.equal(v.doc.months[0].expenses[0].details, '<img src=x onerror=alert(1)>');
});
test('backup text parsing errors', () => {
  for (const [t, code] of [['', 'empty'], ['   ', 'empty'], [null, 'empty'], ['{not json', 'not_json'], ['x'.repeat(5 * 1024 * 1024 + 1), 'too_big']]) assert.throws(() => parseBackupText(t), new RegExp(code));
  assert.deepEqual(parseBackupText('{"a":1}'), { a: 1 });
});
