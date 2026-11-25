// bal/validate.js — validate + sanitize a whole document (used on import and as a guard).
// Never throws on bad input: returns {ok:false, errors:[codes]} instead.
// Unknown keys and any key starting with "_" are dropped.

import { migrate } from '../dal/migrate.js';
import { MAX_AMOUNT, MONTH_ID_RE } from './month-calc.js';

export const LIMITS = { months: 600, flats: 500, items: 500, history: 200, details: 60, note: 500, society: 60, label: 20, name: 60, phone: 20 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^[0-9+\-\s()]*$/;
let seq = 0;
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const isInt = (v) => Number.isInteger(v);
const isStr = (v) => typeof v === 'string';
const amountOk = (v) => isInt(v) && v >= 0 && v <= MAX_AMOUNT;

function cleanText(v, max) {
  if (!isStr(v)) return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? null : t;
}

function person(p, errs, where) {
  if (p === null || p === undefined) return null;
  if (typeof p !== 'object' || Array.isArray(p)) { errs.push(`${where}:bad_person`); return null; }
  const name = cleanText(p.name ?? '', LIMITS.name);
  const phone = cleanText(p.phone ?? '', LIMITS.phone);
  if (name === null) errs.push(`${where}:bad_name`);
  if (phone === null || !PHONE_RE.test(phone)) errs.push(`${where}:bad_phone`);
  return { name: name ?? '', phone: phone ?? '' };
}

function items(list, kind, mid, errs) {
  if (!Array.isArray(list)) { errs.push(`${mid}:${kind}_not_array`); return []; }
  if (list.length > LIMITS.items) { errs.push(`${mid}:${kind}_too_many`); return []; }
  const seen = new Set();
  const out = [];
  list.forEach((e, i) => {
    const w = `${mid}:${kind}[${i}]`;
    if (!e || typeof e !== 'object') { errs.push(`${w}:bad_item`); return; }
    const details = cleanText(e.details, LIMITS.details);
    if (!details) errs.push(`${w}:bad_details`);
    let amount = e.amount;
    if (kind === 'expenses' && (amount === null || amount === undefined)) amount = null;
    else if (!amountOk(amount)) errs.push(`${w}:bad_amount`);
    let date = e.date ?? null;
    if (date !== null && !(isStr(date) && DATE_RE.test(date))) { errs.push(`${w}:bad_date`); date = null; }
    let id = isStr(e.id) && e.id && e.id.length <= 64 ? e.id : uid();
    if (seen.has(id)) id = uid();
    seen.add(id);
    const item = { id, details: details || '', amount, date };
    if (kind === 'expenses') item.repeat = e.repeat === true;
    else if (e.kind === 'adjustment') item.kind = 'adjustment';
    out.push(item);
  });
  return out;
}

export function validateDoc(input) {
  const errs = [];
  let raw;
  try { raw = migrate(input); } catch (e) { return { ok: false, errors: [e.message] }; }

  const s = raw.settings;
  if (!s || typeof s !== 'object') return { ok: false, errors: ['bad_settings'] };
  const societyName = cleanText(s.societyName, LIMITS.society);
  if (!societyName) errs.push('settings:bad_society_name');
  if (!(isInt(s.startingSavings) && Math.abs(s.startingSavings) <= MAX_AMOUNT * 100)) errs.push('settings:bad_starting_savings');

  if (!Array.isArray(raw.flats) || raw.flats.length > LIMITS.flats) errs.push('bad_flats');
  if (!Array.isArray(raw.months) || raw.months.length > LIMITS.months) errs.push('bad_months');
  if (errs.length) return { ok: false, errors: errs };

  const flats = [];
  const labels = new Set();
  raw.flats.forEach((f, i) => {
    const w = `flat[${i}]`;
    if (!f || typeof f !== 'object') { errs.push(`${w}:bad_flat`); return; }
    const label = cleanText(f.label, LIMITS.label);
    if (!label) errs.push(`${w}:bad_label`);
    else if (labels.has(label.toLowerCase())) errs.push(`${w}:duplicate_label`);
    else labels.add(label.toLowerCase());
    const owner = person(f.owner ?? { name: '', phone: '' }, errs, `${w}:owner`) || { name: '', phone: '' };
    const tenant = person(f.tenant, errs, `${w}:tenant`);
    const history = [];
    if (f.history !== undefined && !Array.isArray(f.history)) errs.push(`${w}:bad_history`);
    else (f.history || []).slice(0, LIMITS.history).forEach((h) => {
      if (!h || typeof h !== 'object') return;
      const nm = cleanText(h.name ?? '', LIMITS.name);
      const ph = cleanText(h.phone ?? '', LIMITS.phone);
      if (nm === null || ph === null) { errs.push(`${w}:bad_history_item`); return; }
      const until = isStr(h.until) && DATE_RE.test(h.until) ? h.until : null;
      history.push({ role: h.role === 'tenant' ? 'tenant' : 'owner', name: nm, phone: ph, until });
    });
    const rate = f.rate === null || f.rate === undefined ? null : f.rate;
    if (rate !== null && !amountOk(rate)) errs.push(`${w}:bad_rate`);
    flats.push({ id: isStr(f.id) && f.id ? f.id : uid(), label: label || '', rate, owner, tenant, history });
  });

  const months = [];
  const ids = new Set();
  raw.months.forEach((m, i) => {
    const w = `month[${i}]`;
    if (!m || typeof m !== 'object') { errs.push(`${w}:bad_month`); return; }
    if (!isStr(m.id) || !MONTH_ID_RE.test(m.id)) { errs.push(`${w}:bad_id`); return; }
    if (ids.has(m.id)) { errs.push(`${m.id}:duplicate_month`); return; }
    ids.add(m.id);
    const status = m.status === 'closed' ? 'closed' : m.status === 'open' ? 'open' : null;
    if (!status) errs.push(`${m.id}:bad_status`);
    const c = m.collection;
    let collection = { amount: 0, source: 'manual' };
    if (!c || typeof c !== 'object' || !amountOk(c.amount)) errs.push(`${m.id}:bad_collection`);
    else {
      collection = { amount: c.amount, source: c.source === 'computed' ? 'computed' : 'manual' };
      if (collection.source === 'computed') {
        const groups = [];
        let okGroups = Array.isArray(c.groups) && c.groups.length <= 50;
        if (okGroups) {
          for (const g of c.groups) {
            if (!g || !isInt(g.count) || g.count < 1 || g.count > 1000 || !amountOk(g.rate)) { okGroups = false; break; }
            const lbl = g.label === undefined || g.label === null ? null : cleanText(g.label, LIMITS.label);
            if (g.label !== undefined && g.label !== null && !lbl) { okGroups = false; break; }
            groups.push(lbl ? { count: g.count, rate: g.rate, label: lbl } : { count: g.count, rate: g.rate });
          }
        }
        if (okGroups) collection.groups = groups; else collection.source = 'manual';
      }
      const cn = c.note === undefined || c.note === null ? null : cleanText(c.note, LIMITS.note);
      if (cn) collection.note = cn;
    }
    let note = null;
    if (m.note !== null && m.note !== undefined) {
      note = cleanText(m.note, LIMITS.note);
      if (note === null) errs.push(`${m.id}:bad_note`);
    }
    months.push({
      id: m.id, status: status || 'open',
      expenses: items(m.expenses, 'expenses', m.id, errs),
      extraIncome: items(m.extraIncome ?? [], 'extraIncome', m.id, errs),
      collection, note: note || null,
    });
  });

  if (errs.length) return { ok: false, errors: errs };
  return {
    ok: true, errors: [],
    doc: {
      app: raw.app, schemaVersion: raw.schemaVersion,
      settings: { societyName, startingSavings: s.startingSavings, currency: 'INR' },
      flats, months,
    },
  };
}
