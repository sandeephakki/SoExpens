import test from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../bal/month-rules.js';
import * as svc from '../bal/service.js';
import { computeAll, specialStats, sortedMonths } from '../bal/month-calc.js';
import { buildReport } from '../bal/report-model.js';
import { validateDoc } from '../bal/validate.js';
import { migrate, emptyDoc } from '../dal/migrate.js';
import { createMemoryStore } from '../dal/store.js';
import { sampleDoc, throwsCode } from './helpers.mjs';

const no = async (fn, code) => assert.equal(await throwsCode(fn, code), null);
const twelve = (d) => d.flats.filter((f) => f.label !== 'Top Room').map((f) => f.id);
const sp = (d, mid = '2026-01') => d.months.find((m) => m.id === mid).specials[0];
const mk = (d) => r.addSpecial(d, '2026-01', { title: 'Civil work', amount: 4000, flatIds: twelve(d) });

test('your example: 12 flats x 4000 = 48,000 collected, 42,000 spent, the 6,000 left stays in savings', () => {
  let d = emptyDoc(); d.settings.startingSavings = 30095;
  d = r.addFlatsBulk(d, { count: 12, prefix: 'Flat ', start: 1, amount: 2000 }); d = r.addFlat(d, { label: 'Top Room', rate: 750, owner: { name: '' } });
  d = r.addMonthAt(d, '2026-12').doc;
  const base = computeAll(d).get('2026-12');
  assert.equal(base.closing, 30095 + 24750);
  d = r.addSpecial(d, '2026-12', { title: 'Civil work', amount: 4000, flatIds: d.flats.filter((f) => f.label !== 'Top Room').map((f) => f.id) });
  assert.equal(computeAll(d).get('2026-12').closing, base.closing, 'nothing counts until paid');
  d = r.markAllPaid(d, '2026-12', d.months[0].specials[0].id, '2026-12-05');
  d = r.addItem(d, '2026-12', 'expenses', { details: 'Civil work', amount: 42000 });
  const c = computeAll(d).get('2026-12');
  assert.equal(c.special, 48000); assert.equal(c.closing, 30095 + 24750 + 48000 - 42000); assert.equal(c.closing - base.closing, 6000);
});
test('only PAID flats count; unpaying removes the money again; pending math', () => {
  let d = mk(sampleDoc()); const s = sp(d);
  assert.deepEqual(specialStats(s), { expected: 48000, collected: 0, paidCount: 0, total: 12, pending: 12, pendingAmount: 48000 });
  d = r.setLinePaid(d, '2026-01', s.id, s.lines[0].id, true, '2026-01-10'); d = r.setLinePaid(d, '2026-01', s.id, s.lines[1].id, true, null);
  assert.equal(specialStats(sp(d)).collected, 8000); assert.equal(computeAll(d).get('2026-01').closing, 10250 + 8000);
  assert.equal(sp(d).lines[0].paidOn, '2026-01-10');
  d = r.setLinePaid(d, '2026-01', s.id, s.lines[0].id, false, '2026-01-11');
  assert.equal(sp(d).lines[0].paidOn, null); assert.equal(specialStats(sp(d)).collected, 4000);
});
test('line edits: change one amount, remove, add a missing flat; markAllPaid keeps earlier dates', async () => {
  let d = mk(sampleDoc()); const s = sp(d);
  d = r.updateLine(d, '2026-01', s.id, s.lines[0].id, { amount: '2,500' }); assert.equal(sp(d).lines[0].amount, 2500);
  d = r.setLinePaid(d, '2026-01', s.id, s.lines[1].id, true, '2026-01-02'); d = r.markAllPaid(d, '2026-01', s.id, '2026-01-20');
  assert.equal(sp(d).lines[1].paidOn, '2026-01-02'); assert.equal(sp(d).lines[2].paidOn, '2026-01-20'); assert.ok(sp(d).lines.every((l) => l.paid));
  d = r.removeLine(d, '2026-01', s.id, s.lines[0].id); assert.equal(sp(d).lines.length, 11);
  const top = d.flats.find((f) => f.label === 'Top Room'); d = r.addLine(d, '2026-01', s.id, { flatId: top.id, amount: 1000 });
  assert.equal(sp(d).lines.at(-1).label, 'Top Room'); await no(() => r.addLine(d, '2026-01', s.id, { flatId: top.id, amount: 1 }), 'line_exists');
  await no(() => r.addLine(d, '2026-01', s.id, { flatId: 'ghost', amount: 1 }), 'flat_not_found');
  await no(() => r.updateLine(d, '2026-01', s.id, 'ghost', { amount: 1 }), 'line_not_found'); await no(() => r.updateLine(d, '2026-01', s.id, s.lines[1].id, { amount: -1 }), 'amount_negative');
});
test('create validation: every bad input rejected, duplicates in flatIds collapse', async () => {
  const d = sampleDoc(); const ids = twelve(d);
  await no(() => r.addSpecial(d, '2026-01', { title: '', amount: 5, flatIds: ids }), 'details_required');
  await no(() => r.addSpecial(d, '2026-01', { title: 'x'.repeat(61), amount: 5, flatIds: ids }), 'details_too_long');
  for (const [a, code] of [['', 'amount_required'], ['0', 'amount_zero'], ['-1', 'amount_negative'], ['x', 'amount_invalid'], ['1.5', 'amount_not_whole'], ['10000000', 'amount_too_big']]) await no(() => r.addSpecial(d, '2026-01', { title: 'T', amount: a, flatIds: ids }), code);
  await no(() => r.addSpecial(d, '2026-01', { title: 'T', amount: 5, flatIds: [] }), 'nothing_selected');
  await no(() => r.addSpecial(d, '2026-01', { title: 'T', amount: 5, flatIds: 'all' }), 'nothing_selected');
  await no(() => r.addSpecial(d, '2026-01', { title: 'T', amount: 5, flatIds: ['ghost'] }), 'flat_not_found');
  await no(() => r.addSpecial(d, '2030-01', { title: 'T', amount: 5, flatIds: ids }), 'month_not_found');
  assert.equal(sp(r.addSpecial(d, '2026-01', { title: 'T', amount: 5, flatIds: [ids[0], ids[0], ids[1]] })).lines.length, 2);
  let many = d; for (let i = 0; i < 20; i++) many = r.addSpecial(many, '2026-01', { title: `S${i}`, amount: 1, flatIds: ids });
  await no(() => r.addSpecial(many, '2026-01', { title: 'one too many', amount: 1, flatIds: ids }), 'too_many_specials');
});
test('closed months refuse every special change; unlock allows it', async () => {
  let d = mk(sampleDoc()); const s = sp(d); const l = s.lines[0].id;
  d = r.setStatus(d, '2026-01', 'closed');
  await no(() => mk(d), 'month_closed'); await no(() => r.setLinePaid(d, '2026-01', s.id, l, true, null), 'month_closed'); await no(() => r.markAllPaid(d, '2026-01', s.id, null), 'month_closed');
  await no(() => r.updateLine(d, '2026-01', s.id, l, { amount: 1 }), 'month_closed'); await no(() => r.removeLine(d, '2026-01', s.id, l), 'month_closed');
  await no(() => r.deleteSpecial(d, '2026-01', s.id), 'month_closed'); await no(() => r.updateSpecial(d, '2026-01', s.id, { title: 'x' }), 'month_closed');
  assert.ok(r.setLinePaid(r.setStatus(d, '2026-01', 'open'), '2026-01', s.id, l, true, null));
});
test('update / delete special; last flat cannot be removed; bad dates and flags rejected', async () => {
  let d = mk(sampleDoc()); const s = sp(d);
  d = r.updateSpecial(d, '2026-01', s.id, { title: '  New   name ', note: ' hi ' }); assert.equal(sp(d).title, 'New name'); assert.equal(sp(d).note, 'hi');
  assert.equal(sp(r.updateSpecial(d, '2026-01', s.id, { note: '  ' })).note, null);
  await no(() => r.updateSpecial(d, '2026-01', s.id, { title: '' }), 'details_required'); await no(() => r.updateSpecial(d, '2026-01', s.id, { note: 'x'.repeat(501) }), 'note_too_long');
  await no(() => r.setLinePaid(d, '2026-01', s.id, s.lines[0].id, 'yes', null), 'bad_paid'); await no(() => r.setLinePaid(d, '2026-01', s.id, s.lines[0].id, true, '5/1/2026'), 'date_invalid');
  await no(() => r.setLinePaid(d, '2026-01', 'ghost', s.lines[0].id, true, null), 'special_not_found');
  const b = sampleDoc(); const one = r.addSpecial(b, '2026-01', { title: 'One', amount: 5, flatIds: [b.flats[0].id] });
  await no(() => r.removeLine(one, '2026-01', sp(one).id, sp(one).lines[0].id), 'last_line');
  assert.equal(r.deleteSpecial(d, '2026-01', s.id).months[0].specials.length, 0); await no(() => r.deleteSpecial(d, '2026-01', 'ghost'), 'special_not_found');
});
test('a special keeps its flat names: deleting or renaming flats later never changes it', () => {
  let d = mk(sampleDoc()); const before = JSON.stringify(sp(d).lines.map((l) => [l.label, l.amount]));
  d = r.deleteFlat(d, d.flats[0].id); d = r.setRates(d, 'all', 1);
  assert.equal(JSON.stringify(sp(d).lines.map((l) => [l.label, l.amount])), before);
});
test('renaming or deleting the month takes its specials along; new months start empty', () => {
  let d = mk(sampleDoc()); d = r.renameMonth(d, '2026-01', '2026-03'); assert.equal(d.months[0].specials.length, 1);
  assert.equal(r.addMonthAt(d, '2026-04').doc.months.find((m) => m.id === '2026-04').specials.length, 0);
  assert.equal(r.deleteMonth(d, '2026-03').months.length, 0);
});
test('report image rows: collected amount with groups and pending count', () => {
  let d = mk(sampleDoc()); const s = sp(d);
  d = r.markAllPaid(d, '2026-01', s.id, null); let rep = buildReport(d, '2026-01');
  const row = rep.summary.find((x) => x.text.startsWith('Special collection')); assert.equal(row.text, 'Special collection - Civil work (12 flats x 4000)'); assert.equal(row.amount, '48,000');
  d = r.setLinePaid(d, '2026-01', s.id, s.lines[0].id, false, null); d = r.setLinePaid(d, '2026-01', s.id, s.lines[1].id, false, null); rep = buildReport(d, '2026-01');
  assert.equal(rep.summary.find((x) => x.text.startsWith('Special')).text, 'Special collection - Civil work (10 flats x 4000, 2 pending)');
  assert.equal(rep.summary.find((x) => x.text.startsWith('Special')).amount, '40,000'); assert.equal(rep.savings.amount, '50,250'); assert.equal(rep.summary.map((x) => x.sl).join(), '1,2,3');
  const b = sampleDoc(); const e = r.addSpecial(b, '2026-01', { title: 'Nobody yet', amount: 100, flatIds: twelve(b) });
  assert.equal(buildReport(e, '2026-01').summary.find((x) => x.text.startsWith('Special')).text, 'Special collection - Nobody yet (12 pending)');
});
test('import validation for specials: good data passes, every corruption is reported', () => {
  const good = mk(sampleDoc()); assert.ok(validateDoc(JSON.parse(JSON.stringify(good))).ok);
  const bad = (f) => { const d = JSON.parse(JSON.stringify(good)); f(sp(d)); return validateDoc(d); };
  const has = (v, frag) => !v.ok && v.errors.some((e) => e.includes(frag));
  assert.ok(has(bad((s) => { s.title = ''; }), 'bad_title')); assert.ok(has(bad((s) => { s.note = 5; }), 'bad_note'));
  assert.ok(has(bad((s) => { s.lines = 'x'; }), 'bad_lines')); assert.ok(has(bad((s) => { s.lines[0].amount = -1; }), 'bad_amount'));
  assert.ok(has(bad((s) => { s.lines[0].amount = 1.5; }), 'bad_amount')); assert.ok(has(bad((s) => { s.lines[0].paid = 'yes'; }), 'bad_paid'));
  assert.ok(has(bad((s) => { s.lines[0].paidOn = '5/1'; }), 'bad_date')); assert.ok(has(bad((s) => { s.lines[0].label = ''; }), 'bad_label'));
  assert.ok(has(bad((s) => { s.lines[1].flatId = s.lines[0].flatId; }), 'duplicate_flat')); assert.ok(has(bad((s) => { s.lines[0] = null; }), 'bad_line'));
  const d = JSON.parse(JSON.stringify(good)); d.months[0].specials = 'x'; assert.ok(has(validateDoc(d), 'specials_not_array'));
  const e = JSON.parse(JSON.stringify(good)); e.months[0].specials = Array(21).fill(sp(good)); assert.ok(has(validateDoc(e), 'too_many_specials'));
  const f = bad((s) => { s.lines[0].paid = false; s.lines[0].paidOn = '2026-01-05'; }); assert.ok(f.ok); assert.equal(sp(f.doc).lines[0].paidOn, null, 'unpaid line cannot keep a paid date');
  const g = JSON.parse(JSON.stringify(good)); delete g.months[0].specials; const gv = validateDoc(g); assert.ok(gv.ok); assert.deepEqual(gv.doc.months[0].specials, []);
});
test('v2 backups open in v3 with empty specials; the real v1/v2 chain still works', () => {
  const v2 = JSON.parse(JSON.stringify(sampleDoc())); v2.schemaVersion = 2; v2.months.forEach((m) => delete m.specials);
  const m = migrate(v2); assert.equal(m.schemaVersion, 3); assert.deepEqual(m.months[0].specials, []);
  assert.ok(validateDoc(v2).ok);
  assert.equal(emptyDoc().schemaVersion, 3);
});
test('service end to end: create, pay, persist across reload, export/import keeps who paid', async () => {
  const store = createMemoryStore(false); await store.set('doc', sampleDoc()); svc.setClock(() => new Date(2026, 0, 20)); await svc.init(store);
  await svc.addSpecial('2026-01', { title: 'Borewell', amount: '5,000', flatIds: twelve(svc.getDoc()) });
  const id = svc.getMonthView('2026-01').specials[0].id; const l0 = svc.getMonthView('2026-01').specials[0].lines[0].id;
  await svc.setLinePaid('2026-01', id, l0, true);
  let v = svc.getMonthView('2026-01'); assert.equal(v.specials[0].stats.collected, 5000); assert.equal(v.specials[0].lines[0].paidOn, '2026-01-20'); assert.equal(v.calc.closing, 10250 + 5000);
  await svc.init(store); v = svc.getMonthView('2026-01'); assert.equal(v.specials[0].stats.paidCount, 1);
  const { text } = svc.prepareBackup(); await svc.markBackedUp(); await svc.init(createMemoryStore(false)); const p = svc.previewImport(text); assert.ok(p.ok); await svc.applyImport(p.doc);
  assert.equal(svc.getMonthView('2026-01').specials[0].stats.collected, 5000);
  await svc.markAllPaid('2026-01', id); assert.equal(svc.getMonthView('2026-01').specials[0].stats.pending, 0);
  await svc.removeLine('2026-01', id, l0); await svc.updateSpecial('2026-01', id, { title: 'Borewell motor' }); await svc.deleteSpecial('2026-01', id); assert.equal(svc.getMonthView('2026-01').specials.length, 0);
});
test('random stress with specials: truth rule holds and every step validates', () => {
  let seed = 777; const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return (seed >>> 8) % n; };
  let d = sampleDoc(); d = r.addMonthAt(d, '2026-02').doc; let ok = 0;
  const truth = (x) => x.settings.startingSavings + x.months.reduce((s, m) => s + m.collection.amount + m.extraIncome.reduce((a, e) => a + e.amount, 0) + m.specials.reduce((a, q) => a + q.lines.filter((l) => l.paid).reduce((b, l) => b + l.amount, 0), 0) - m.expenses.reduce((a, e) => a + (e.amount || 0), 0), 0);
  for (let i = 0; i < 500; i++) {
    try {
      const m = d.months[rnd(d.months.length)]; const q = m.specials[rnd(Math.max(1, m.specials.length))]; const l = q && q.lines[rnd(q.lines.length)]; const op = rnd(9);
      if (op === 0) d = r.addSpecial(d, m.id, { title: `S${i}`, amount: 1 + rnd(5000), flatIds: d.flats.slice(0, 1 + rnd(d.flats.length)).map((f) => f.id) });
      else if (op === 1 && q) d = r.setLinePaid(d, m.id, q.id, l.id, rnd(2) === 1, null);
      else if (op === 2 && q) d = r.markAllPaid(d, m.id, q.id, null);
      else if (op === 3 && q) d = r.updateLine(d, m.id, q.id, l.id, { amount: rnd(9000) });
      else if (op === 4 && q) d = r.removeLine(d, m.id, q.id, l.id);
      else if (op === 5 && q) d = r.deleteSpecial(d, m.id, q.id);
      else if (op === 6) d = r.addItem(d, m.id, 'expenses', { details: `E${i}`, amount: rnd(50000) });
      else if (op === 7) d = r.setStatus(d, m.id, m.status === 'open' ? 'closed' : 'open');
      else if (op === 8 && q) d = r.addLine(d, m.id, q.id, { flatId: d.flats[rnd(d.flats.length)].id, amount: rnd(3000) });
      ok++;
    } catch (e) { assert.ok(/^[a-z_]+$/.test(e.message), e.message); }
    const v = validateDoc(d); assert.ok(v.ok, v.errors.join()); const ms = sortedMonths(d);
    assert.equal(computeAll(d).get(ms[ms.length - 1].id).closing, truth(d), `step ${i}`);
  }
  assert.ok(ok > 200, `only ${ok} ok`);
});
