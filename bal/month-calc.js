// bal/month-calc.js — pure money maths. No DOM, no storage.
// Opening and closing savings are NEVER stored: they are derived here, so editing
// any old month always updates every later month.

export const MAX_AMOUNT = 9999999;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = MON;
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2099;
export const MONTH_ID_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function monthLabel(id) {
  const m = MONTH_ID_RE.exec(id);
  if (!m) return String(id);
  return `${MON[Number(m[2]) - 1]} ${m[1]}`;
}

export function nextMonthId(id) {
  const m = MONTH_ID_RE.exec(id);
  if (!m) throw new Error('bad_month_id');
  let y = Number(m[1]);
  let mo = Number(m[2]) + 1;
  if (mo > 12) { mo = 1; y += 1; }
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}`;
}

// Indian digit grouping: 1,23,456. Negative gets a leading "-".
export function fmt(n) {
  const v = Math.trunc(Number(n) || 0);
  const s = String(Math.abs(v));
  let out = s;
  if (s.length > 3) {
    const last = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    out = `${rest},${last}`;
  }
  return v < 0 ? `-${out}` : out;
}

export function sortedMonths(doc) {
  return [...doc.months].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function monthTotals(m) {
  let spent = 0;
  let pending = 0;
  for (const e of m.expenses) {
    if (e.amount === null || e.amount === undefined) pending += 1;
    else spent += e.amount;
  }
  const extra = m.extraIncome.reduce((s, x) => s + (x.amount || 0), 0);
  return { spent, pending, extra, collection: m.collection.amount };
}

// Returns Map(monthId -> {opening, collection, extra, spent, pending, balance, closing})
export function computeAll(doc) {
  const out = new Map();
  let opening = doc.settings.startingSavings;
  for (const m of sortedMonths(doc)) {
    const t = monthTotals(m);
    const balance = t.collection + t.extra - t.spent;
    const closing = opening + balance;
    out.set(m.id, { opening, ...t, balance, closing });
    opening = closing;
  }
  return out;
}

// Units with an amount, grouped by amount. Biggest group first.
// A group of one keeps the unit's own name: "Top Room - 750". Pure, so settings changes
// never touch months that already hold their own snapshot.
export function collectionFromFlats(flats) {
  const byRate = new Map();
  for (const f of flats) {
    if (!f.rate || f.rate <= 0) continue;
    if (!byRate.has(f.rate)) byRate.set(f.rate, []);
    byRate.get(f.rate).push(f.label);
  }
  const groups = [...byRate.entries()]
    .map(([rate, labels]) => (labels.length === 1 ? { count: 1, rate, label: labels[0] } : { count: labels.length, rate }))
    .sort((a, b) => b.count - a.count || b.rate - a.rate);
  return { amount: groups.reduce((s, g) => s + g.count * g.rate, 0), groups };
}

export function groupsText(groups) {
  return groups.map((g) => (g.count === 1 && g.label ? `${g.label} - ${g.rate}` : `${g.count} flats x ${g.rate}`)).join(' + ');
}

export function collectionText(m) {
  const c = m.collection;
  if (c.source === 'computed' && Array.isArray(c.groups) && c.groups.length) return `Total collection (${groupsText(c.groups)})`;
  return c.note ? `Total collection (${c.note})` : 'Total collection';
}

// "Amount carried forward to Nov 2026: 41,933 - 6,838 = 35,095"
export function carryLine(monthId, calc) {
  const sign = calc.balance < 0 ? '-' : '+';
  return `Amount carried forward to ${monthLabel(nextMonthId(monthId))}: ` +
    `${fmt(calc.opening)} ${sign} ${fmt(Math.abs(calc.balance))} = ${fmt(calc.closing)}`;
}

// "2026-10-14" -> "14 Oct"
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return `${Number(m[3])} ${MON[Number(m[2]) - 1] || ''}`.trim();
}

// Whole months from a to b (b later => positive). Used to spot gaps between entered months.
export function monthsBetween(a, b) {
  const x = MONTH_ID_RE.exec(a);
  const y = MONTH_ID_RE.exec(b);
  if (!x || !y) throw new Error('month_invalid');
  return (Number(y[1]) * 12 + Number(y[2])) - (Number(x[1]) * 12 + Number(x[2]));
}
