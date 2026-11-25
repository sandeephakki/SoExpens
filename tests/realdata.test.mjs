// Runs only when SOEXPENS_DATA points at your real backup (never committed to the repo).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDoc } from '../bal/validate.js';
import { computeAll } from '../bal/month-calc.js';
import { buildReport } from '../bal/report-model.js';
import * as r from '../bal/month-rules.js';

const file = process.env.SOEXPENS_DATA;
test('real data: every month matches the recorded oracle', { skip: !file }, () => {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const v = validateDoc(raw); assert.ok(v.ok, v.errors.join());
  const calc = computeAll(v.doc);
  for (const m of raw.months) { const c = calc.get(m.id); assert.equal(c.opening, m._expected.opening, m.id); assert.equal(c.spent, m._expected.totalSpent, m.id); assert.equal(c.closing, m._expected.closing, m.id); }
});
test('real data: Oct 2026 report equals the shared image numbers; Jul fix cascades', { skip: !file }, () => {
  const v = validateDoc(JSON.parse(fs.readFileSync(file, 'utf8'))); const d = v.doc;
  const rep = buildReport(d, '2026-10');
  assert.equal(rep.totalSpent, '31,588'); assert.equal(rep.balance.amount, '-6,838');
  assert.equal(rep.carryLine, 'Amount carried forward to Nov 2026: 41,933 - 6,838 = 35,095');
  const adj = d.months.find((m) => m.id === '2026-07').extraIncome.find((x) => x.kind === 'adjustment');
  const fixed = r.deleteItem(r.setStatus(d, '2026-07', 'open'), '2026-07', 'extraIncome', adj.id); // closed months must be unlocked first
  assert.equal(computeAll(fixed).get('2026-10').closing, 34495);
  assert.equal(computeAll(fixed).get('2026-11').opening, 34495);
});
test('real data: unlock a closed month, edit, close again, nothing else moves', { skip: !file }, () => {
  let d = validateDoc(JSON.parse(fs.readFileSync(file, 'utf8'))).doc;
  const before = computeAll(d); d = r.setStatus(d, '2026-03', 'open');
  d = r.updateItem(d, '2026-03', 'expenses', d.months.find((m) => m.id === '2026-03').expenses[4].id, { amount: 600 });
  d = r.setStatus(d, '2026-03', 'closed'); const after = computeAll(d);
  assert.equal(after.get('2026-02').closing, before.get('2026-02').closing);
  assert.equal(after.get('2026-11').closing, before.get('2026-11').closing - 100);
});
