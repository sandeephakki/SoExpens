import { emptyDoc } from '../dal/migrate.js';
import * as rules from '../bal/month-rules.js';

export function sampleDoc() {
  let d = emptyDoc();
  d.settings.societyName = 'Test Society';
  d = rules.addFlatsBulk(d, { count: 12, prefix: 'Flat ', start: 1, amount: 2000 });
  d = rules.addFlat(d, { label: 'Top Room', rate: 750, owner: { name: '' }, tenant: null });
  d = rules.addMonth(d, '2026-01-10').doc;                       // 2026-01
  d = rules.addItem(d, '2026-01', 'expenses', { details: 'Salary', amount: 10000, repeat: true });
  d = rules.addItem(d, '2026-01', 'expenses', { details: 'Water Bill', amount: 4000, repeat: true });
  d = rules.addItem(d, '2026-01', 'expenses', { details: 'Cleaning', amount: 500 });
  return d;
}
export async function throwsCode(fn, code) {
  let got = null;
  try { await fn(); } catch (e) { got = e.message; }
  return got === code ? null : `expected ${code}, got ${got}`;
}
