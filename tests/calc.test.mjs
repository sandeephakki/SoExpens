import test from 'node:test';
import assert from 'node:assert/strict';
import { fmt, monthLabel, nextMonthId, computeAll, carryLine, collectionText, shortDate } from '../bal/month-calc.js';
import { sampleDoc } from './helpers.mjs';

test('fmt uses Indian grouping and handles edge values', () => {
  assert.equal(fmt(0), '0'); assert.equal(fmt(999), '999'); assert.equal(fmt(1000), '1,000');
  assert.equal(fmt(41933), '41,933'); assert.equal(fmt(100000), '1,00,000'); assert.equal(fmt(1234567), '12,34,567');
  assert.equal(fmt(-6838), '-6,838'); assert.equal(fmt(9999999), '99,99,999');
  assert.equal(fmt(null), '0'); assert.equal(fmt(undefined), '0'); assert.equal(fmt(NaN), '0');
});
test('month label and next month, including year rollover', () => {
  assert.equal(monthLabel('2026-10'), 'Oct 2026');
  assert.equal(nextMonthId('2026-12'), '2027-01'); assert.equal(nextMonthId('2026-09'), '2026-10');
  assert.throws(() => nextMonthId('2026-13'), /bad_month_id/);
  assert.throws(() => nextMonthId('nope'), /bad_month_id/);
  assert.equal(monthLabel('garbage'), 'garbage');
});
test('closing = opening + collection + extra - spent, chained across months', () => {
  const d = sampleDoc();
  const c = computeAll(d).get('2026-01');
  assert.equal(c.spent, 14500); assert.equal(c.collection, 24750); assert.equal(c.opening, 0);
  assert.equal(c.balance, 10250); assert.equal(c.closing, 10250);
});
test('pending (null) amounts count as 0 and are counted', () => {
  const d = sampleDoc(); d.months[0].expenses[1].amount = null;
  const c = computeAll(d).get('2026-01');
  assert.equal(c.spent, 10500); assert.equal(c.pending, 1);
});
test('carry line matches the Excel wording, with minus on deficit', () => {
  const calc = { opening: 41933, balance: -6838, closing: 35095 };
  assert.equal(carryLine('2026-10', calc), 'Amount carried forward to Nov 2026: 41,933 - 6,838 = 35,095');
  assert.equal(carryLine('2026-12', { opening: 10, balance: 5, closing: 15 }), 'Amount carried forward to Jan 2027: 10 + 5 = 15');
});
test('collection text', () => {
  assert.equal(collectionText({ collection: { amount: 24750, source: 'computed', groups: [{ count: 12, rate: 2000 }, { count: 1, rate: 750, label: 'Top Room' }] } }), 'Total collection (12 flats x 2000 + Top Room - 750)');
  assert.equal(collectionText({ collection: { amount: 1, source: 'manual' } }), 'Total collection');
  assert.equal(collectionText({ collection: { amount: 1, source: 'manual', note: 'x' } }), 'Total collection (x)');
});
test('shortDate', () => { assert.equal(shortDate('2026-10-04'), '4 Oct'); assert.equal(shortDate(null), ''); assert.equal(shortDate('bad'), ''); });
