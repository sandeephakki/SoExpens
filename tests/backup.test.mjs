import test from 'node:test';
import assert from 'node:assert/strict';
import * as svc from '../bal/service.js';
import { createMemoryStore } from '../dal/store.js';
import { sampleDoc, throwsCode } from './helpers.mjs';

const no = async (fn, code) => assert.equal(await throwsCode(fn, code), null);
async function fresh(meta) {
  const store = createMemoryStore(false); await store.set('doc', sampleDoc()); if (meta) await store.set('meta', meta);
  svc.setClock(() => new Date(2026, 0, 20, 10, 0)); await svc.init(store); return store;
}
const change = (i) => svc.addExpense('2026-01', { details: `Item ${i}`, amount: 10 + i });

test('reminder after every 5 changes (like Spend-na), not before', async () => {
  await fresh();
  assert.equal(svc.getBackupState().kind, null); assert.equal(svc.REMIND_EVERY, 5);
  for (let i = 1; i <= 4; i++) { await change(i); assert.equal(svc.getBackupState().kind, null, `after ${i}`); }
  await change(5); assert.deepEqual([svc.getBackupState().kind, svc.getBackupState().dirty], ['remind', 5]);
});
test('"Later" snoozes for 5 MORE changes, then reminds again', async () => {
  await fresh(); for (let i = 1; i <= 5; i++) await change(i);
  await svc.snoozeReminder(); assert.equal(svc.getBackupState().kind, null);
  for (let i = 6; i <= 9; i++) { await change(i); assert.equal(svc.getBackupState().kind, null, `after ${i}`); }
  await change(10); assert.equal(svc.getBackupState().kind, 'remind'); assert.equal(svc.getBackupState().dirty, 10);
});
test('making the file does not count as backed up; saving it does, and it survives a reload', async () => {
  const store = await fresh(); for (let i = 1; i <= 5; i++) await change(i);
  const b = svc.prepareBackup(); assert.match(b.filename, /^soexpens-backup-2026-01-20\.json$/); assert.ok(JSON.parse(b.text).months.length);
  assert.equal(svc.getBackupState().dirty, 5, 'prepare alone changes nothing');
  await svc.markBackedUp(); assert.deepEqual([svc.getBackupState().kind, svc.getBackupState().dirty, svc.getMeta().lastBackupAt], [null, 0, '2026-01-20']);
  await svc.init(store); assert.equal(svc.getBackupState().dirty, 0); assert.equal(svc.getMeta().nextRemind, 5);
  for (let i = 6; i <= 10; i++) await change(i); assert.equal(svc.getBackupState().kind, 'remind');
});
test('closing a month makes a backup DUE; nothing but saving a backup clears it', async () => {
  const store = await fresh(); await change(1);
  assert.equal(svc.getBackupState().kind, null);
  await svc.closeMonth('2026-01'); assert.equal(svc.getBackupState().kind, 'due');
  await svc.snoozeReminder(); assert.equal(svc.getBackupState().kind, 'due', 'Later cannot hide a due backup');
  await svc.unlockMonth('2026-01'); await change(2); assert.equal(svc.getBackupState().kind, 'due', 'other edits do not clear it');
  await svc.init(store); assert.equal(svc.getBackupState().kind, 'due', 'it survives closing and reopening the app');
  svc.prepareBackup(); assert.equal(svc.getBackupState().kind, 'due');
  await svc.markBackedUp(); assert.equal(svc.getBackupState().kind, null);
  await svc.closeMonth('2026-01'); assert.equal(svc.getBackupState().kind, 'due', 'closing again asks again');
});
test('a failed save leaves the backup still due and says so', async () => {
  const store = await fresh(); await svc.closeMonth('2026-01');
  const orig = store.set; store.set = async (k, v) => { if (k === 'meta') throw new Error('disk'); return orig(k, v); };
  await no(() => svc.markBackedUp(), 'save_failed'); assert.equal(svc.getBackupState().kind, 'due');
});
test('only real changes count: a rejected edit adds nothing', async () => {
  await fresh(); await no(() => svc.addExpense('2026-01', { details: '', amount: 5 }), 'details_required'); await no(() => svc.addExpense('2030-01', { details: 'x', amount: 5 }), 'month_not_found');
  assert.equal(svc.getBackupState().dirty, 0);
});
test('restoring a backup clears the reminder and any due flag', async () => {
  await fresh(); await change(1); await svc.closeMonth('2026-01'); assert.equal(svc.getBackupState().kind, 'due');
  const p = svc.previewImport(svc.prepareBackup().text); await svc.applyImport(p.doc);
  assert.deepEqual([svc.getBackupState().kind, svc.getBackupState().dirty], [null, 0]);
});
test('older saved meta (from before this feature) loads with safe defaults', async () => {
  await fresh({ lastBackupAt: '2026-01-01', dirty: 7 });
  assert.equal(svc.getMeta().nextRemind, 5); assert.equal(svc.getMeta().backupDue, false); assert.equal(svc.getBackupState().kind, 'remind', '7 unbacked changes, never reminded -> remind now');
});
test('your Spend-na rule: dirty count is per change, so a month of edits triggers several reminders', async () => {
  await fresh(); let reminders = 0;
  for (let i = 1; i <= 23; i++) { await change(i); if (svc.getBackupState().kind === 'remind') { reminders++; await svc.snoozeReminder(); } }
  assert.equal(reminders, 4, '5, 10, 15, 20');
});
