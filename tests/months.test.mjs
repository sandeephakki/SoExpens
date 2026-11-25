import test from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../bal/month-rules.js';
import * as svc from '../bal/service.js';
import { computeAll, sortedMonths, monthsBetween } from '../bal/month-calc.js';
import { validateDoc } from '../bal/validate.js';
import { createMemoryStore } from '../dal/store.js';
import { sampleDoc, throwsCode } from './helpers.mjs';

const no = async (fn, code) => assert.equal(await throwsCode(fn, code), null);
const closingOfLast = (d) => { const ms = sortedMonths(d); return computeAll(d).get(ms[ms.length - 1].id).closing; };
// Truth rule: the last closing is ALWAYS starting savings + sum over all months of (collection + extra - spent).
const identity = (d) => d.settings.startingSavings + d.months.reduce((s, m) => s + m.collection.amount + m.extraIncome.reduce((a, x) => a + x.amount, 0) - m.expenses.reduce((a, e) => a + (e.amount || 0), 0), 0);

test('add past, present and future months in any order; balances follow date order', () => {
  let d = sampleDoc();                                  // 2026-01 (spent 14,500, collection 24,750)
  d = r.addMonthAt(d, '2025-06').doc;                   // past
  d = r.addMonthAt(d, '2031-03').doc;                   // far future
  d = r.addMonthAt(d, '2026-08').doc;                   // between
  assert.deepEqual(sortedMonths(d).map((m) => m.id), ['2025-06', '2026-01', '2026-08', '2031-03']);
  const c = computeAll(d);
  assert.equal(c.get('2025-06').opening, 0); assert.equal(c.get('2025-06').closing, 24750);
  assert.equal(c.get('2026-01').opening, 24750); assert.equal(c.get('2026-01').closing, 24750 + 10250);
  assert.equal(closingOfLast(d), identity(d));
});
test('inserting an earlier month makes it the first: starting savings now opens IT', () => {
  let d = sampleDoc(); d.settings.startingSavings = 5000;
  const before = computeAll(d).get('2026-01').opening; assert.equal(before, 5000);
  d = r.addMonthAt(d, '2025-12').doc;
  assert.equal(computeAll(d).get('2025-12').opening, 5000); assert.equal(computeAll(d).get('2026-01').opening, 5000 + 24750);
});
test('month id validation: every bad shape rejected, duplicates and range blocked', async () => {
  const d = sampleDoc();
  for (const bad of ['', '2026-13', '2026-1', '26-01', '2026-00', 'abcd-ef', '2026/01', ' 2026-01', null, undefined, 5, {}]) await no(() => r.addMonthAt(d, bad), 'month_invalid');
  await no(() => r.addMonthAt(d, '1999-12'), 'month_out_of_range'); await no(() => r.addMonthAt(d, '2100-01'), 'month_out_of_range');
  await no(() => r.addMonthAt(d, '2026-01'), 'month_exists');
  assert.ok(r.addMonthAt(d, '2000-01').doc); assert.ok(r.addMonthAt(d, '2099-12').doc);
});
test('repeat items come from the closest EARLIER month; the earliest month copies nothing', () => {
  let d = sampleDoc();
  d = r.addMonthAt(d, '2026-05').doc; d = r.addItem(d, '2026-05', 'expenses', { details: 'Lift AMC', amount: 100, repeat: true });
  assert.deepEqual(r.addMonthAt(d, '2026-03').doc.months.find((m) => m.id === '2026-03').expenses.map((e) => e.details), ['Salary', 'Water Bill']);
  assert.ok(r.addMonthAt(d, '2026-09').doc.months.find((m) => m.id === '2026-09').expenses.some((e) => e.details === 'Lift AMC'));
  assert.equal(r.addMonthAt(d, '2025-01').doc.months.find((m) => m.id === '2025-01').expenses.length, 0);
});
test('rename: keeps entries, re-orders, recalculates; every bad case rejected', async () => {
  let d = sampleDoc(); d = r.addMonthAt(d, '2026-02').doc; d = r.addItem(d, '2026-02', 'expenses', { details: 'X', amount: 1000 });
  const e = r.renameMonth(d, '2026-02', '2025-10');
  assert.deepEqual(sortedMonths(e).map((m) => m.id), ['2025-10', '2026-01']);
  assert.ok(e.months.find((m) => m.id === '2025-10').expenses.some((x) => x.details === 'X' && x.amount === 1000));
  assert.equal(closingOfLast(e), identity(e));
  await no(() => r.renameMonth(d, '2026-02', '2026-02'), 'month_same'); await no(() => r.renameMonth(d, '2026-02', '2026-01'), 'month_exists');
  await no(() => r.renameMonth(d, '2026-02', '2026-13'), 'month_invalid'); await no(() => r.renameMonth(d, '2026-02', '1900-01'), 'month_out_of_range');
  await no(() => r.renameMonth(d, '2030-01', '2030-02'), 'month_not_found');
  const closed = r.setStatus(d, '2026-02', 'closed');
  assert.equal(r.renameMonth(closed, '2026-02', '2026-03').months.find((m) => m.id === '2026-03').status, 'closed');
});
test('delete any month (first, middle, last, closed); chain stays truthful', async () => {
  let d = sampleDoc(); for (const id of ['2026-02', '2026-03', '2026-04']) d = r.addMonthAt(d, id).doc;
  d = r.addItem(d, '2026-03', 'expenses', { details: 'Big', amount: 5000 }); d = r.setStatus(d, '2026-03', 'closed');
  for (const id of ['2026-01', '2026-03', '2026-04', '2026-02']) { const e = r.deleteMonth(d, id); assert.ok(!e.months.some((m) => m.id === id)); assert.equal(closingOfLast(e), identity(e)); }
  assert.equal(r.deleteMonth(r.deleteMonth(r.deleteMonth(r.deleteMonth(d, '2026-01'), '2026-02'), '2026-03'), '2026-04').months.length, 0);
  await no(() => r.deleteMonth(d, '2030-01'), 'month_not_found'); assert.equal(d.months.length, 4, 'input untouched');
});
test('previewChange tells the truth and changes nothing', async () => {
  const store = createMemoryStore(false); await store.set('doc', sampleDoc()); svc.setClock(() => new Date(2026, 9, 14)); await svc.init(store);
  const snap = JSON.stringify(svc.getDoc());
  const del = svc.previewChange('delete', '2026-01'); assert.equal(del.before, 10250); assert.equal(del.after, 0);
  const add = svc.previewChange('add', '2025-01'); assert.equal(add.becomesFirst, true); assert.equal(add.after, 10250 + 24750);
  assert.equal(svc.previewChange('add', '2027-01').becomesFirst, false);
  assert.equal(svc.previewChange('rename', '2026-01', '2025-01').becomesFirst, true);
  assert.equal(JSON.stringify(svc.getDoc()), snap);
  await no(() => svc.previewChange('add', '2026-01'), 'month_exists'); await no(() => svc.previewChange('delete', '1999-01'), 'month_not_found');
  await no(() => svc.previewChange('rename', '2026-01', 'zz'), 'month_invalid');
});
test('service: gap is reported in the month view; two identical adds race safely', async () => {
  const store = createMemoryStore(false); await store.set('doc', sampleDoc()); svc.setClock(() => new Date(2026, 9, 14)); await svc.init(store);
  await svc.addMonthAt('2026-05'); assert.deepEqual(svc.getMonthView('2026-05').gap, { prevLabel: 'Jan 2026', missing: 3 }); assert.equal(svc.getMonthView('2026-01').gap, null);
  const res = await Promise.allSettled([svc.addMonthAt('2027-01'), svc.addMonthAt('2027-01')]);
  assert.equal(res.filter((x) => x.status === 'fulfilled').length, 1); assert.equal(res.find((x) => x.status === 'rejected').reason.message, 'month_exists');
  await svc.renameMonth('2026-05', '2026-02'); assert.equal(svc.getMonthView('2026-02').gap, null);
  await svc.deleteMonth('2026-02'); assert.equal(svc.listMonths().length, 2);
  assert.equal(monthsBetween('2025-12', '2026-01'), 1); assert.equal(monthsBetween('2026-01', '2025-12'), -1);
});
test('random mix of adds / renames / deletes / edits never breaks the truth rule or validation', async () => {
  let seed = 12345; const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return (seed >>> 8) % n; };
  let d = sampleDoc(); let ok = 0;
  const id = () => `${2024 + rnd(4)}-${String(1 + rnd(12)).padStart(2, '0')}`;
  for (let i = 0; i < 400; i++) {
    try {
      const pick = d.months.length ? d.months[rnd(d.months.length)] : null; const op = rnd(8);
      if (op <= 2) d = r.addMonthAt(d, id()).doc;
      else if (op === 3 && pick) d = r.renameMonth(d, pick.id, id());
      else if (op === 4 && pick) d = r.deleteMonth(d, pick.id);
      else if (op === 5 && pick) d = r.addItem(d, pick.id, 'expenses', { details: `E${i}`, amount: rnd(40000), repeat: rnd(2) === 1 });
      else if (op === 6 && pick) d = r.addItem(d, pick.id, 'extraIncome', { details: `X${i}`, amount: rnd(3000) });
      else if (op === 7 && pick) d = r.setStatus(d, pick.id, pick.status === 'open' ? 'closed' : 'open');
      ok++;
    } catch (e) { assert.ok(/^[a-z_]+$/.test(e.message), `unexpected error ${e.message}`); }
    const v = validateDoc(d); assert.ok(v.ok, v.errors.join());
    if (d.months.length) assert.equal(closingOfLast(d), identity(d), `step ${i}`);
    const ids = d.months.map((m) => m.id); assert.equal(new Set(ids).size, ids.length);
  }
  assert.ok(ok > 150, `only ${ok} operations succeeded`);
});
