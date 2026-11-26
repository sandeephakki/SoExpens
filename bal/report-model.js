// bal/report-model.js — turns a month into the rows of the shared report image.
// Pure data: ui/report-canvas.js draws it. Same layout as the Excel block.

import { monthLabel, collectionText, carryLine, computeAll, fmt, sortedMonths, specialStats, groupsText, collectionFromFlats } from './month-calc.js';

export function buildReport(doc, monthId) {
  const m = doc.months.find((x) => x.id === monthId);
  if (!m) throw new Error('month_not_found');
  const calc = computeAll(doc).get(monthId);

  const items = m.expenses.map((e, i) => ({
    sl: String(i + 1), text: e.details, amount: e.amount === null ? 'Pending' : fmt(e.amount),
  }));

  const summary = [];
  let n = 1;
  summary.push({ sl: String(n++), text: collectionText(m), amount: fmt(m.collection.amount) });
  m.extraIncome.forEach((x) => summary.push({ sl: String(n++), text: x.details, amount: fmt(x.amount) }));
  for (const sp of (m.specials || [])) {
    const st = specialStats(sp);
    const paidGroups = collectionFromFlats(sp.lines.filter((l) => l.paid).map((l) => ({ label: l.label, rate: l.amount }))).groups;
    const bits = [];
    if (paidGroups.length) bits.push(groupsText(paidGroups));
    if (st.pending > 0) bits.push(`${st.pending} pending`);
    summary.push({ sl: String(n++), text: `Special collection - ${sp.title}${bits.length ? ` (${bits.join(', ')})` : ''}`, amount: fmt(st.collected) });
  }
  summary.push({ sl: String(n++), text: 'Total spent', amount: fmt(calc.spent), bold: true });
  const total = { text: 'Balance Remaining', amount: fmt(calc.balance), bold: true };
  const savings = { text: 'Total savings carried forward', amount: fmt(calc.closing), bold: true };

  return {
    society: doc.settings.societyName,
    titlePre: 'Apartment Maintenance Report - ',
    titleBold: monthLabel(monthId),
    items,
    totalSpent: fmt(calc.spent),
    summaryTitle: 'Collections & Summary',
    summary,
    balance: total,
    savings,
    carryLine: carryLine(monthId, calc),
    note: m.note,
    hasPending: calc.pending > 0,
    fileName: `soexpens-${monthId}.png`,
    monthCount: sortedMonths(doc).length,
  };
}
