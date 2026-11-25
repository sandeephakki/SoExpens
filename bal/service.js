// bal/service.js — the single entry point UI talks to. Holds the live document,
// applies pure rules, validates, persists through DAL, notifies subscribers.
// UI never imports from dal/. BAL never touches the DOM.

import { emptyDoc } from '../dal/migrate.js';
import { toBackupText, parseBackupText, backupFileName } from '../dal/backup.js';
import { validateDoc } from './validate.js';
import * as rules from './month-rules.js';
import { computeAll, sortedMonths, monthLabel, nextMonthId, carryLine, collectionText, collectionFromFlats, monthsBetween } from './month-calc.js';
import { buildReport } from './report-model.js';

let store = null;
let doc = emptyDoc();
let meta = { lastBackupAt: null, dirty: 0, lastSavedAt: null };
let loadError = null;
let clock = () => new Date();
let chain = Promise.resolve();
const subs = new Set();

export function setClock(fn) { clock = fn; }
export function todayIso() {
  const d = clock();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function init(s) {
  store = s;
  chain = Promise.resolve();
  loadError = null;
  meta = { lastBackupAt: null, dirty: 0, lastSavedAt: null, ...((await store.get('meta')) || {}) };
  const saved = await store.get('doc');
  if (!saved) { doc = emptyDoc(); return; }
  const v = validateDoc(saved);
  if (v.ok) { doc = v.doc; return; }
  // Stored data is damaged: keep a copy, start empty, tell the UI.
  await store.set('doc_corrupt', saved);
  doc = emptyDoc();
  loadError = v.errors.slice(0, 5);
}

export const getDoc = () => doc;
export const getMeta = () => meta;
export const getLoadError = () => loadError;
export const isVolatile = () => !!(store && store.volatile);
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
const notify = () => subs.forEach((fn) => fn());

// Serialised so two quick taps can never interleave a read-modify-write.
function commit(change) {
  const run = async () => {
    const next = change(doc);
    const v = validateDoc(next);
    if (!v.ok) throw new Error('invariant_failed');
    try { await store.set('doc', v.doc); } catch (e) { throw new Error('save_failed'); }
    doc = v.doc;
    meta = { ...meta, dirty: (meta.dirty || 0) + 1, lastSavedAt: clock().getTime() };
    try { await store.set('meta', meta); } catch (e) { /* doc is saved; meta is only a convenience */ }
    notify();
    return v.doc;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// ---- reads -----------------------------------------------------------------
export function listMonths() {
  const calc = computeAll(doc);
  return sortedMonths(doc).map((m) => ({ id: m.id, label: monthLabel(m.id), status: m.status, calc: calc.get(m.id) }));
}
export function getMonthView(id) {
  const month = doc.months.find((m) => m.id === id);
  if (!month) return null;
  const calc = computeAll(doc).get(id);
  const sorted = sortedMonths(doc);
  const idx = sorted.findIndex((m) => m.id === id);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const missing = prev ? monthsBetween(prev.id, id) - 1 : 0;
  return {
    month, calc, label: monthLabel(id), nextLabel: monthLabel(nextMonthId(id)), carryLine: carryLine(id, calc), collectionText: collectionText(month),
    gap: missing > 0 ? { prevLabel: monthLabel(prev.id), missing } : null,
  };
}
export function getReport(id) { return buildReport(doc, id); }
// Everything the Society card shows is derived from the flats list: one source of truth.
export function getSummary() {
  const flats = doc.flats;
  return { units: flats.length, monthly: collectionFromFlats(flats).amount, noAmount: flats.filter((f) => !f.rate).length };
}
export function suggestedNextMonth() {
  const ms = sortedMonths(doc);
  return monthLabel(ms.length ? nextMonthId(ms[ms.length - 1].id) : rules.monthOf(todayIso()));
}
export function latestMonthId() {
  const ms = sortedMonths(doc);
  return ms.length ? ms[ms.length - 1].id : null;
}

// ---- months ----------------------------------------------------------------
export async function addMonth() {
  let id = null;
  await commit((d) => { const r = rules.addMonth(d, todayIso()); id = r.id; return r.doc; });
  return id;
}
export async function addMonthAt(id) {
  await commit((d) => rules.addMonthAt(d, id).doc);
  return id;
}
export const renameMonth = (id, newId) => commit((d) => rules.renameMonth(d, id, newId));
export const deleteMonth = (id) => commit((d) => rules.deleteMonth(d, id));

// What would this change do to the savings at the end of the latest month? Changes nothing.
// kind: 'add' (a = month id) | 'delete' (a = id) | 'rename' (a = id, b = new id). Throws the same codes as the real change.
export function previewChange(kind, a, b) {
  const next = kind === 'add' ? rules.addMonthAt(doc, a).doc : kind === 'delete' ? rules.deleteMonth(doc, a) : rules.renameMonth(doc, a, b);
  const latest = (d) => {
    const ms = sortedMonths(d);
    return ms.length ? computeAll(d).get(ms[ms.length - 1].id).closing : d.settings.startingSavings;
  };
  const was = sortedMonths(doc);
  const now = sortedMonths(next);
  return {
    before: latest(doc), after: latest(next),
    becomesFirst: now.length > 0 && (was.length === 0 || now[0].id < was[0].id) && now[0].id === (kind === 'rename' ? b : a),
    startingSavings: doc.settings.startingSavings,
  };
}
export const closeMonth = (id) => commit((d) => rules.setStatus(d, id, 'closed'));
export const unlockMonth = (id) => commit((d) => rules.setStatus(d, id, 'open'));
export const saveMonthMeta = (id, v) => commit((d) => rules.updateMonthMeta(d, id, v));
export const recalcCollection = (id) => commit((d) => rules.recalcCollection(d, id));

// ---- items -----------------------------------------------------------------
export const addExpense = (mid, v) => commit((d) => rules.addItem(d, mid, 'expenses', { ...v, date: todayIso() }));
export const addExtraIncome = (mid, v) => commit((d) => rules.addItem(d, mid, 'extraIncome', { ...v, date: todayIso() }));
export const updateItem = (mid, kind, id, v) => commit((d) => rules.updateItem(d, mid, kind, id, v));
export const deleteItem = (mid, kind, id) => commit((d) => rules.deleteItem(d, mid, kind, id));

// ---- settings and flats ----------------------------------------------------
export const saveSettings = (v) => commit((d) => rules.updateSettings(d, v));
export const addFlat = (v) => commit((d) => rules.addFlat(d, v));
export const saveFlat = (id, v) => commit((d) => rules.updateFlat(d, id, v, todayIso()));
export const removeFlat = (id) => commit((d) => rules.deleteFlat(d, id));
export const setRates = (ids, amount) => commit((d) => rules.setRates(d, ids, amount));
export const addFlatsBulk = (v) => commit((d) => rules.addFlatsBulk(d, v));

// ---- backup ----------------------------------------------------------------
export async function exportBackup() {
  const text = toBackupText({ ...doc, exportedAt: todayIso() });
  meta = { ...meta, lastBackupAt: todayIso(), dirty: 0 };
  try { await store.set('meta', meta); } catch (e) { /* backup text is still valid */ }
  notify();
  return { text, filename: backupFileName(todayIso()) };
}

// Step 1: parse + validate, change nothing.
export function previewImport(text) {
  let raw;
  try { raw = parseBackupText(text); } catch (e) { return { ok: false, errors: [e.message] }; }
  const v = validateDoc(raw);
  if (!v.ok) return { ok: false, errors: v.errors };
  return { ok: true, errors: [], doc: v.doc, summary: { society: v.doc.settings.societyName, months: v.doc.months.length, flats: v.doc.flats.length } };
}
// Step 2: replace everything, after saving the current data as a safety copy.
export async function applyImport(newDoc) {
  const v = validateDoc(newDoc);
  if (!v.ok) throw new Error('invariant_failed');
  try { await store.set('doc_prev', doc); } catch (e) { throw new Error('save_failed'); }
  const out = await commit(() => v.doc);
  meta = { ...meta, dirty: 0 };
  try { await store.set('meta', meta); } catch (e) { /* convenience only */ }
  notify();
  return out;
}
export async function hasPrevious() { return (await store.get('doc_prev')) !== null; }
export async function restorePrevious() {
  const prev = await store.get('doc_prev');
  if (!prev) throw new Error('no_previous');
  return applyImport(prev);
}
