import test from 'node:test';
import assert from 'node:assert/strict';
import * as svc from '../bal/service.js';
import { createMemoryStore } from '../dal/store.js';
import { sampleDoc, throwsCode } from './helpers.mjs';

async function fresh(doc) {
  const store = createMemoryStore(false);
  if (doc) await store.set('doc', doc);
  svc.setClock(() => new Date(2026, 9, 14));
  await svc.init(store);
  return store;
}
const no = async (fn, code) => assert.equal(await throwsCode(fn, code), null);

test('first run: empty doc, add month uses today, data persists across init', async () => {
  const store = await fresh();
  assert.equal(svc.listMonths().length, 0);
  const id = await svc.addMonth();
  assert.equal(id, '2026-10');
  await svc.addExpense(id, { details: 'Salary', amount: '10,000', repeat: true });
  await svc.init(store); // simulate reload
  assert.equal(svc.getDoc().months[0].expenses[0].amount, 10000);
  assert.equal(svc.getDoc().months[0].expenses[0].date, '2026-10-14');
});
test('failed save leaves state untouched and reports save_failed', async () => {
  const store = await fresh(sampleDoc());
  const before = JSON.stringify(svc.getDoc());
  const orig = store.set; store.set = async () => { throw new Error('disk full'); };
  await no(() => svc.addExpense('2026-01', { details: 'x', amount: 5 }), 'save_failed');
  assert.equal(JSON.stringify(svc.getDoc()), before);
  store.set = orig;
  await svc.addExpense('2026-01', { details: 'x', amount: 5 }); // recovers
  assert.equal(svc.getDoc().months[0].expenses.length, 4);
});
test('rapid double tap: two adds both land, in order, no lost update', async () => {
  await fresh(sampleDoc());
  await Promise.all([svc.addExpense('2026-01', { details: 'one', amount: 1 }), svc.addExpense('2026-01', { details: 'two', amount: 2 })]);
  assert.deepEqual(svc.getDoc().months[0].expenses.slice(-2).map((e) => e.details), ['one', 'two']);
});
test('adding the same month twice quickly: second is rejected, only one created', async () => {
  await fresh(sampleDoc());
  const res = await Promise.allSettled([svc.addMonth(), svc.addMonth()]);
  // second call computes the NEXT month (serialised), so both succeed with different ids, never a duplicate
  const ids = svc.getDoc().months.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length); assert.equal(res.filter((r) => r.status === 'fulfilled').length, 2);
});
test('subscribers are notified on change', async () => {
  await fresh(sampleDoc()); let n = 0; const off = svc.subscribe(() => { n++; });
  await svc.addExpense('2026-01', { details: 'x', amount: 5 }); off(); await svc.addExpense('2026-01', { details: 'y', amount: 5 });
  assert.equal(n, 1);
});
test('close, unlock, delete last month; errors surface as codes', async () => {
  await fresh(sampleDoc());
  await svc.closeMonth('2026-01');
  await no(() => svc.addExpense('2026-01', { details: 'x', amount: 5 }), 'month_closed');
  await svc.unlockMonth('2026-01');
  const id = await svc.addMonth();
  await svc.deleteMonth(id);
  assert.equal(svc.listMonths().length, 1);
  await no(() => svc.closeMonth('1999-01'), 'month_not_found');
});
test('backup export -> wipe -> import gives identical data on a "new device"', async () => {
  await fresh(sampleDoc());
  await svc.addExtraIncome('2026-01', { details: 'Interest', amount: 250 });
  await svc.addFlat({ label: 'A1', rate: 2000, owner: { name: 'Ravi', phone: '99' }, tenant: { name: 'S', phone: '' } });
  const original = structuredClone(svc.getDoc());
  const { text, filename } = svc.prepareBackup(); await svc.markBackedUp();
  assert.match(filename, /^soexpens-backup-2026-10-14\.json$/);
  await fresh(); // other device
  const p = svc.previewImport(text);
  assert.ok(p.ok); assert.deepEqual(p.summary, { society: 'Test Society', months: 1, flats: 14 });
  await svc.applyImport(p.doc);
  const { exportedAt, ...rest } = JSON.parse(text);
  assert.deepEqual(svc.getDoc(), original); assert.deepEqual(JSON.parse(JSON.stringify(svc.getDoc())), rest);
  assert.equal(svc.getMeta().lastBackupAt, null, 'new device has no backup date until it exports');
});
test('bad imports change nothing; good import keeps an undo copy', async () => {
  const store = await fresh(sampleDoc());
  const keep = JSON.stringify(svc.getDoc());
  for (const t of ['', 'nope', '{"app":"X"}', JSON.stringify({ ...sampleDoc(), schemaVersion: 7 }), JSON.stringify({ ...sampleDoc(), months: [{ id: 'bad' }] })]) {
    assert.equal(svc.previewImport(t).ok, false, t.slice(0, 30));
  }
  assert.equal(JSON.stringify(svc.getDoc()), keep);
  assert.equal(await svc.hasPrevious(), false);
  const other = sampleDoc(); other.settings.societyName = 'Other';
  await svc.applyImport(svc.previewImport(JSON.stringify(other)).doc);
  assert.equal(svc.getDoc().settings.societyName, 'Other');
  assert.equal(await svc.hasPrevious(), true);
  await svc.restorePrevious();
  assert.equal(svc.getDoc().settings.societyName, 'Test Society');
  await store.remove('doc_prev'); await no(() => svc.restorePrevious(), 'no_previous');
});
test('corrupt stored data: app starts empty, keeps a copy, reports the problem', async () => {
  const store = createMemoryStore(false); await store.set('doc', { app: 'SoExpens', schemaVersion: 1, settings: {}, flats: [], months: [] });
  await svc.init(store);
  assert.equal(svc.listMonths().length, 0); assert.ok(svc.getLoadError()); assert.ok(await store.get('doc_corrupt'));
});
test('report: Oct-style numbers, pending marker, carry line', async () => {
  await fresh(sampleDoc());
  await svc.addExpense('2026-01', { details: 'A very long particular that should wrap onto a second line', amount: 3 });
  const r = svc.getReport('2026-01');
  assert.equal(r.titleBold, 'Jan 2026'); assert.equal(r.items[0].text, 'Salary'); assert.equal(r.items[0].amount, '10,000');
  assert.equal(r.totalSpent, '14,503'); assert.equal(r.savings.amount, '10,247'); assert.match(r.carryLine, /^Amount carried forward to Feb 2026: 0 \+ 10,247 = 10,247$/);
  assert.equal(r.summary[0].text, 'Total collection (12 flats x 2000 + Top Room - 750)');
  await svc.updateItem('2026-01', 'expenses', svc.getDoc().months[0].expenses[0].id, { amount: '' });
  assert.equal(svc.getReport('2026-01').items[0].amount, 'Pending'); assert.equal(svc.getReport('2026-01').hasPending, true);
  assert.throws(() => svc.getReport('1999-01'), /month_not_found/);
});
