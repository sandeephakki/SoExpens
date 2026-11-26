// bal/month-rules.js — pure document edits. Each function takes a doc and returns a NEW doc
// (or throws Error with a stable code). No DOM, no storage.

import { MAX_AMOUNT, MONTH_ID_RE, MIN_YEAR, MAX_YEAR, nextMonthId, collectionFromFlats } from './month-calc.js';
import { LIMITS, uid } from './validate.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^[0-9+\-\s()]*$/;
const clone = (d) => structuredClone(d);
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export const monthOf = (isoDate) => isoDate.slice(0, 7);

function findMonth(doc, id) {
  const m = doc.months.find((x) => x.id === id);
  if (!m) throw new Error('month_not_found');
  return m;
}
function editable(doc, id) {
  const m = findMonth(doc, id);
  if (m.status === 'closed') throw new Error('month_closed');
  return m;
}

// ---- input parsing -------------------------------------------------------
// Accepts number or numeric string. Returns int or null (blank). Throws on junk.
export function parseAmount(v, { allowBlank = false } = {}) {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
    if (allowBlank) return null;
    throw new Error('amount_required');
  }
  const s = typeof v === 'string' ? v.trim().replace(/,/g, '') : v;
  const n = typeof s === 'number' ? s : Number(s);
  if (!Number.isFinite(n) || (typeof s === 'string' && !/^-?\d+(\.\d+)?$/.test(s))) throw new Error('amount_invalid');
  if (!Number.isInteger(n)) throw new Error('amount_not_whole');
  if (n < 0) throw new Error('amount_negative');
  if (n > MAX_AMOUNT) throw new Error('amount_too_big');
  return n;
}
export function parseDetails(v) {
  const t = squash(v);
  if (!t) throw new Error('details_required');
  if (t.length > LIMITS.details) throw new Error('details_too_long');
  return t;
}

// ---- months ---------------------------------------------------------------
// Any month from Jan 2000 to Dec 2099 can be added (past, present or future) in any order.
// Balances are always derived from the sorted months, so nothing here can make them wrong.
function checkNewId(doc, id) {
  if (typeof id !== 'string' || !MONTH_ID_RE.test(id)) throw new Error('month_invalid');
  const y = Number(id.slice(0, 4));
  if (y < MIN_YEAR || y > MAX_YEAR) throw new Error('month_out_of_range');
  if (doc.months.some((m) => m.id === id)) throw new Error('month_exists');
}

export function addMonthAt(doc, id) {
  if (doc.months.length >= LIMITS.months) throw new Error('too_many_months');
  checkNewId(doc, id);
  // repeat-every-month items come from the closest earlier month that exists
  const before = doc.months.filter((m) => m.id < id).sort((a, b) => (a.id < b.id ? -1 : 1));
  const prev = before[before.length - 1];
  const d = clone(doc);
  const repeated = (prev ? prev.expenses : []).filter((e) => e.repeat).map((e) => ({
    id: uid(), details: e.details, amount: null, date: null, repeat: true,
  }));
  d.months.push({
    id, status: 'open', expenses: repeated, extraIncome: [], specials: [], note: null,
    collection: { ...collectionFromFlats(doc.flats), source: 'computed' },
  });
  return { doc: d, id };
}

// "Add next": the month after the latest one (or this month when there are none).
export function addMonth(doc, today) {
  const sorted = [...doc.months].sort((a, b) => (a.id < b.id ? -1 : 1));
  const last = sorted[sorted.length - 1];
  return addMonthAt(doc, last ? nextMonthId(last.id) : monthOf(today));
}

export function renameMonth(doc, id, newId) {
  findMonth(doc, id);
  if (id === newId) throw new Error('month_same');
  checkNewId(doc, newId);
  const d = clone(doc);
  findMonth(d, id).id = newId;
  return d;
}

export function deleteMonth(doc, id) {
  findMonth(doc, id);
  const d = clone(doc);
  d.months = d.months.filter((m) => m.id !== id);
  return d;
}

export function setStatus(doc, id, status) {
  const m = findMonth(doc, id);
  if (m.status === status) throw new Error(status === 'closed' ? 'already_closed' : 'already_open');
  const d = clone(doc);
  findMonth(d, id).status = status;
  return d;
}

export function updateMonthMeta(doc, id, { collectionAmount, note }) {
  editable(doc, id);
  const d = clone(doc);
  const m = findMonth(d, id);
  if (collectionAmount !== undefined) {
    const amt = parseAmount(collectionAmount);
    if (amt !== m.collection.amount) m.collection = { amount: amt, source: 'manual', ...(m.collection.note ? { note: m.collection.note } : {}) };
  }
  if (note !== undefined) {
    const n = squash(note);
    if (n.length > LIMITS.note) throw new Error('note_too_long');
    m.note = n || null;
  }
  return d;
}

// Explicit, never automatic: re-snapshot an OPEN month from the current flats.
export function recalcCollection(doc, id) {
  editable(doc, id);
  const d = clone(doc);
  findMonth(d, id).collection = { ...collectionFromFlats(d.flats), source: 'computed' };
  return d;
}

// ---- items (kind: 'expenses' | 'extraIncome') ------------------------------
function listFor(m, kind) {
  if (kind !== 'expenses' && kind !== 'extraIncome') throw new Error('bad_kind');
  return m[kind];
}

export function addItem(doc, monthId, kind, { details, amount, repeat = false, date = null, adjustment = false }) {
  editable(doc, monthId);
  const det = parseDetails(details);
  const amt = parseAmount(amount); // new entries need an amount
  if (date !== null && !DATE_RE.test(date)) throw new Error('date_invalid');
  const d = clone(doc);
  const list = listFor(findMonth(d, monthId), kind);
  if (list.length >= LIMITS.items) throw new Error('too_many_items');
  const item = { id: uid(), details: det, amount: amt, date };
  if (kind === 'expenses') item.repeat = repeat === true;
  else if (adjustment) item.kind = 'adjustment';
  list.push(item);
  return d;
}

export function updateItem(doc, monthId, kind, itemId, { details, amount, repeat }) {
  editable(doc, monthId);
  const d = clone(doc);
  const list = listFor(findMonth(d, monthId), kind);
  const it = list.find((x) => x.id === itemId);
  if (!it) throw new Error('item_not_found');
  if (details !== undefined) it.details = parseDetails(details);
  if (amount !== undefined) {
    // expenses may be cleared back to "pending"; extra income may not
    it.amount = parseAmount(amount, { allowBlank: kind === 'expenses' });
  }
  if (repeat !== undefined && kind === 'expenses') it.repeat = repeat === true;
  return d;
}

export function deleteItem(doc, monthId, kind, itemId) {
  editable(doc, monthId);
  const d = clone(doc);
  const m = findMonth(d, monthId);
  const before = m[kind].length;
  m[kind] = listFor(m, kind).filter((x) => x.id !== itemId);
  if (m[kind].length === before) throw new Error('item_not_found');
  return d;
}

// ---- settings --------------------------------------------------------------
export function updateSettings(doc, v) {
  const name = squash(v.societyName);
  if (!name) throw new Error('society_required');
  if (name.length > LIMITS.society) throw new Error('society_too_long');
  const start = Number(String(v.startingSavings ?? '').replace(/,/g, ''));
  if (!Number.isInteger(start) || Math.abs(start) > MAX_AMOUNT * 100) throw new Error('starting_invalid');
  const d = clone(doc);
  d.settings = { ...d.settings, societyName: name, startingSavings: start };
  return d;
}

// ---- flats -----------------------------------------------------------------
function cleanPerson(p, role) {
  if (!p) return null;
  const name = squash(p.name);
  const phone = squash(p.phone);
  if (!name && !phone) return null;
  if (name.length > LIMITS.name) throw new Error(`${role}_name_too_long`);
  if (phone.length > LIMITS.phone || !PHONE_RE.test(phone)) throw new Error(`${role}_phone_invalid`);
  return { name, phone };
}
function parseFlat(doc, f, selfId) {
  const label = squash(f.label);
  if (!label) throw new Error('label_required');
  if (label.length > LIMITS.label) throw new Error('label_too_long');
  if (doc.flats.some((x) => x.id !== selfId && x.label.toLowerCase() === label.toLowerCase())) throw new Error('label_duplicate');
  const owner = cleanPerson(f.owner, 'owner') || { name: '', phone: '' };
  const tenant = cleanPerson(f.tenant, 'tenant');
  return { label, rate: parseAmount(f.rate), owner, tenant };
}

export function addFlat(doc, f) {
  if (doc.flats.length >= LIMITS.flats) throw new Error('too_many_flats');
  const p = parseFlat(doc, f, null);
  const d = clone(doc);
  d.flats.push({ id: uid(), ...p, history: [] });
  return d;
}

// Name change on owner or tenant keeps the old person in history (dated).
export function updateFlat(doc, id, f, today) {
  const cur = doc.flats.find((x) => x.id === id);
  if (!cur) throw new Error('flat_not_found');
  const p = parseFlat(doc, f, id);
  const d = clone(doc);
  const t = d.flats.find((x) => x.id === id);
  const hist = [];
  if (cur.owner.name && cur.owner.name !== p.owner.name) hist.push({ role: 'owner', name: cur.owner.name, phone: cur.owner.phone, until: today });
  if (cur.tenant && cur.tenant.name && (!p.tenant || cur.tenant.name !== p.tenant.name)) hist.push({ role: 'tenant', name: cur.tenant.name, phone: cur.tenant.phone, until: today });
  t.label = p.label; t.rate = p.rate; t.owner = p.owner; t.tenant = p.tenant;
  t.history = [...(t.history || []), ...hist].slice(-LIMITS.history);
  return d;
}

export function deleteFlat(doc, id) {
  if (!doc.flats.some((x) => x.id === id)) throw new Error('flat_not_found');
  const d = clone(doc);
  d.flats = d.flats.filter((x) => x.id !== id);
  return d;
}

// Same amount for all units (ids = 'all') or for chosen units.
export function setRates(doc, ids, amount) {
  const amt = parseAmount(amount);
  const list = ids === 'all' ? doc.flats.map((f) => f.id) : ids;
  if (!Array.isArray(list) || list.length === 0) throw new Error('nothing_selected');
  const have = new Set(doc.flats.map((f) => f.id));
  if (list.some((id) => !have.has(id))) throw new Error('flat_not_found');
  const pick = new Set(list);
  const d = clone(doc);
  d.flats.forEach((f) => { if (pick.has(f.id)) f.rate = amt; });
  return d;
}

// "Flat 1" ... "Flat 12" in one go. All-or-nothing: any clash and nothing is added.
export function addFlatsBulk(doc, { count, prefix, start, amount }) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > LIMITS.flats) throw new Error('bulk_count_invalid');
  const first = start === '' || start === undefined || start === null ? 1 : Number(start);
  if (!Number.isInteger(first) || first < 0 || first > 99999) throw new Error('bulk_start_invalid');
  const pre = String(prefix ?? '');
  if (pre.length > 14) throw new Error('bulk_prefix_invalid');
  const amt = parseAmount(amount);
  if (doc.flats.length + n > LIMITS.flats) throw new Error('too_many_flats');
  const labels = Array.from({ length: n }, (_, i) => squash(`${pre}${first + i}`));
  if (labels.some((l) => l.length > LIMITS.label)) throw new Error('label_too_long');
  const taken = new Set(doc.flats.map((f) => f.label.toLowerCase()));
  for (const l of labels) { if (taken.has(l.toLowerCase())) throw new Error('label_duplicate'); taken.add(l.toLowerCase()); }
  const d = clone(doc);
  labels.forEach((label) => d.flats.push({ id: uid(), label, rate: amt, owner: { name: '', phone: '' }, tenant: null, history: [] }));
  return d;
}

// ---- special collections ----------------------------------------------------
// A one-time amount asked from chosen flats (new motor, civil work). Paid lines add to THIS month's
// income. The real cost is entered as a normal expense; whatever is left over stays in savings.
function specialOf(d, monthId, specialId) {
  const sp = (findMonth(d, monthId).specials || []).find((x) => x.id === specialId);
  if (!sp) throw new Error('special_not_found');
  return sp;
}
function lineOf(sp, lineId) {
  const l = sp.lines.find((x) => x.id === lineId);
  if (!l) throw new Error('line_not_found');
  return l;
}
function positive(v) {
  const n = parseAmount(v);
  if (n < 1) throw new Error('amount_zero');
  return n;
}

export function addSpecial(doc, monthId, { title, amount, flatIds }) {
  editable(doc, monthId);
  const name = parseDetails(title);
  const amt = positive(amount);
  if (!Array.isArray(flatIds) || flatIds.length === 0) throw new Error('nothing_selected');
  const ids = [...new Set(flatIds)];
  const chosen = ids.map((id) => doc.flats.find((f) => f.id === id));
  if (chosen.some((f) => !f)) throw new Error('flat_not_found');
  const d = clone(doc);
  const m = findMonth(d, monthId);
  m.specials = m.specials || [];
  if (m.specials.length >= LIMITS.specials) throw new Error('too_many_specials');
  m.specials.push({
    id: uid(), title: name, note: null,
    lines: chosen.map((f) => ({ id: uid(), flatId: f.id, label: f.label, amount: amt, paid: false, paidOn: null })),
  });
  return d;
}

export function updateSpecial(doc, monthId, specialId, { title, note }) {
  editable(doc, monthId);
  const d = clone(doc);
  const sp = specialOf(d, monthId, specialId);
  if (title !== undefined) sp.title = parseDetails(title);
  if (note !== undefined) {
    const n = squash(note);
    if (n.length > LIMITS.note) throw new Error('note_too_long');
    sp.note = n || null;
  }
  return d;
}

export function deleteSpecial(doc, monthId, specialId) {
  editable(doc, monthId);
  const d = clone(doc);
  specialOf(d, monthId, specialId);
  const m = findMonth(d, monthId);
  m.specials = m.specials.filter((x) => x.id !== specialId);
  return d;
}

export function setLinePaid(doc, monthId, specialId, lineId, paid, date) {
  editable(doc, monthId);
  if (typeof paid !== 'boolean') throw new Error('bad_paid');
  if (date !== null && date !== undefined && !DATE_RE.test(date)) throw new Error('date_invalid');
  const d = clone(doc);
  const l = lineOf(specialOf(d, monthId, specialId), lineId);
  l.paid = paid;
  l.paidOn = paid ? (date ?? null) : null;
  return d;
}

export function markAllPaid(doc, monthId, specialId, date) {
  editable(doc, monthId);
  if (date !== null && date !== undefined && !DATE_RE.test(date)) throw new Error('date_invalid');
  const d = clone(doc);
  specialOf(d, monthId, specialId).lines.forEach((l) => { if (!l.paid) { l.paid = true; l.paidOn = date ?? null; } });
  return d;
}

export function updateLine(doc, monthId, specialId, lineId, { amount }) {
  editable(doc, monthId);
  const amt = parseAmount(amount);
  const d = clone(doc);
  lineOf(specialOf(d, monthId, specialId), lineId).amount = amt;
  return d;
}

export function removeLine(doc, monthId, specialId, lineId) {
  editable(doc, monthId);
  const d = clone(doc);
  const sp = specialOf(d, monthId, specialId);
  lineOf(sp, lineId);
  if (sp.lines.length === 1) throw new Error('last_line');
  sp.lines = sp.lines.filter((x) => x.id !== lineId);
  return d;
}

// Add a flat that was left out (or joined later).
export function addLine(doc, monthId, specialId, { flatId, amount }) {
  editable(doc, monthId);
  const amt = parseAmount(amount);
  const flat = doc.flats.find((f) => f.id === flatId);
  if (!flat) throw new Error('flat_not_found');
  const d = clone(doc);
  const sp = specialOf(d, monthId, specialId);
  if (sp.lines.some((l) => l.flatId === flatId)) throw new Error('line_exists');
  if (sp.lines.length >= LIMITS.items) throw new Error('too_many_items');
  sp.lines.push({ id: uid(), flatId, label: flat.label, amount: amt, paid: false, paidOn: null });
  return d;
}
