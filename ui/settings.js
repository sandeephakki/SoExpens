// ui/settings.js — society name, flats (units) with amount/owner/tenant, backup and restore.
// The monthly collection is always derived from the flats list below. Nothing is typed twice.
import { h, icon, toast } from '../core/dom.js';
import { t, errText } from '../core/i18n.js';
import { modal, confirmBox } from '../core/dialog.js';
import * as svc from '../bal/service.js';
import { fmt, shortDate } from '../bal/month-calc.js';

const selected = new Set(); // flat ids ticked for "set amount"

function field(label, input, hint) {
  return h('label', null, label, input, hint ? h('small', { class: 'hint' }, hint) : null);
}

// ---- society -----------------------------------------------------------------
function societyCard() {
  const s = svc.getDoc().settings;
  const sum = svc.getSummary();
  const err = h('p', { class: 'err', role: 'alert' });
  const name = h('input', { type: 'text', value: s.societyName, maxlength: 60, autocomplete: 'off' });
  const start = h('input', { type: 'text', inputmode: 'numeric', value: String(s.startingSavings) });
  const form = h('form', { class: 'form', novalidate: true },
    field(t('set.society'), name),
    h('div', { class: 'tile' },
      h('span', { class: 'tile-lbl' }, t('set.collectionDerived')),
      h('strong', { class: 'tile-num' }, fmt(sum.monthly)),
      h('span', { class: 'tile-sub' }, t('set.units', { n: sum.units }))),
    sum.noAmount ? h('p', { class: 'banner warn' }, t('set.noAmount', { n: sum.noAmount })) : null,
    sum.units === 0 ? h('p', { class: 'hint' }, t('set.noUnitsHint')) : h('p', { class: 'hint' }, t('set.derivedNote')),
    field(t('set.start'), start, t('set.startHint')),
    err,
    h('button', { type: 'submit', class: 'btn primary' }, t('common.save')));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try { await svc.saveSettings({ societyName: name.value, startingSavings: start.value }); toast(t('toast.saved')); }
    catch (e) { err.textContent = errText(e); }
  });
  return h('article', { class: 'card c-soc' }, h('header', { class: 'card-head' }, h('h2', null, t('set.societyTitle'))), form);
}

// ---- dialogs -----------------------------------------------------------------
function flatDialog(flat) {
  const isNew = !flat;
  const f = flat || { label: '', rate: '', owner: { name: '', phone: '' }, tenant: null, history: [] };
  const err = h('p', { class: 'err', role: 'alert' });
  const label = h('input', { type: 'text', value: f.label, maxlength: 20, autocomplete: 'off', placeholder: 'A1' });
  const rate = h('input', { type: 'text', inputmode: 'numeric', value: f.rate === null || f.rate === '' ? '' : String(f.rate), placeholder: '2000' });
  const oName = h('input', { type: 'text', value: f.owner.name, maxlength: 60, autocomplete: 'off' });
  const oPhone = h('input', { type: 'tel', value: f.owner.phone, maxlength: 20, autocomplete: 'off' });
  const tName = h('input', { type: 'text', value: f.tenant ? f.tenant.name : '', maxlength: 60, autocomplete: 'off' });
  const tPhone = h('input', { type: 'tel', value: f.tenant ? f.tenant.phone : '', maxlength: 20, autocomplete: 'off' });
  const hist = (f.history || []).slice().reverse();
  const form = h('form', { class: 'form', novalidate: true },
    h('div', { class: 'two' }, field(t('flat.label'), label), field(t('flat.amount'), rate)),
    h('fieldset', null, h('legend', null, t('flat.owner')), field(t('flat.name'), oName), field(t('flat.phone'), oPhone)),
    h('fieldset', null, h('legend', null, t('flat.tenant')), field(t('flat.name'), tName), field(t('flat.phone'), tPhone), h('small', { class: 'hint' }, t('flat.tenantHint'))),
    hist.length ? h('div', { class: 'history' }, h('h3', null, t('flat.history')),
      hist.map((x) => h('p', null, `${t(x.role === 'tenant' ? 'flat.tenant' : 'flat.owner')}: ${x.name}${x.phone ? ` (${x.phone})` : ''}${x.until ? ` · ${t('flat.until', { date: shortDate(x.until) })}` : ''}`))) : null,
    h('p', { class: 'hint' }, t('flat.pastNote')),
    err,
    h('div', { class: 'btn-row' },
      isNew ? null : h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        if (!(await confirmBox(t('flat.confirmDelete', { label: f.label }), { ok: t('common.delete'), danger: true }))) return;
        try { await svc.removeFlat(f.id); selected.delete(f.id); m.close(); toast(t('toast.deleted')); } catch (e) { err.textContent = errText(e); }
      } }, t('common.delete')),
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('common.save'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    const v = { label: label.value, rate: rate.value, owner: { name: oName.value, phone: oPhone.value }, tenant: { name: tName.value, phone: tPhone.value } };
    try { if (isNew) await svc.addFlat(v); else await svc.saveFlat(flat.id, v); m.close(); toast(t('toast.saved')); }
    catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t(isNew ? 'flat.addTitle' : 'flat.editTitle'), form);
  (isNew ? label : rate).focus();
}

function rateDialog(ids) {
  const all = ids === 'all';
  const n = all ? svc.getDoc().flats.length : ids.length;
  const err = h('p', { class: 'err', role: 'alert' });
  const amount = h('input', { type: 'text', inputmode: 'numeric', placeholder: '2000', 'aria-label': t('flat.amount') });
  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'msg' }, t(all ? 'rate.allBody' : 'rate.selBody', { n })),
    field(t('flat.amount'), amount),
    h('p', { class: 'hint' }, t('flat.pastNote')),
    err,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('rate.apply', { n }))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try { await svc.setRates(all ? 'all' : ids, amount.value); m.close(); toast(t('toast.saved')); }
    catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t('rate.title'), form);
  amount.focus();
}

function bulkDialog() {
  const err = h('p', { class: 'err', role: 'alert' });
  const count = h('input', { type: 'text', inputmode: 'numeric', value: '10' });
  const prefix = h('input', { type: 'text', value: 'Flat ', maxlength: 14, autocomplete: 'off' });
  const first = h('input', { type: 'text', inputmode: 'numeric', value: '1' });
  const amount = h('input', { type: 'text', inputmode: 'numeric', placeholder: '2000' });
  const preview = h('p', { class: 'hint' });
  const upd = () => {
    const n = Number(count.value), s = Number(first.value);
    preview.textContent = Number.isInteger(n) && n > 0 && Number.isInteger(s) ? `${prefix.value}${s} ... ${prefix.value}${s + n - 1}` : '';
  };
  [count, prefix, first].forEach((i) => i.addEventListener('input', upd)); upd();
  const form = h('form', { class: 'form', novalidate: true },
    h('div', { class: 'two' }, field(t('bulk.count'), count), field(t('flat.amount'), amount)),
    h('div', { class: 'two' }, field(t('bulk.prefix'), prefix), field(t('bulk.first'), first)),
    preview, err,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('bulk.add'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try { await svc.addFlatsBulk({ count: count.value, prefix: prefix.value, start: first.value, amount: amount.value }); m.close(); toast(t('toast.added')); }
    catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t('bulk.title'), form);
  count.select();
}

// ---- flats list --------------------------------------------------------------
function flatsCard() {
  const flats = svc.getDoc().flats;
  const ids = new Set(flats.map((f) => f.id));
  for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);

  const rows = flats.map((f) => {
    const box = h('input', { type: 'checkbox', checked: selected.has(f.id), 'aria-label': t('flat.selectAria', { label: f.label }) });
    box.addEventListener('change', () => { if (box.checked) selected.add(f.id); else selected.delete(f.id); refreshBar(); });
    return h('div', { class: 'frow' },
      h('label', { class: 'pick' }, box),
      h('button', { type: 'button', class: 'fedit', 'aria-label': t('flat.editAria', { label: f.label }), onclick: () => flatDialog(f) },
        h('span', { class: 'fbadge' }, f.label),
        h('span', { class: 'finfo' },
          h('span', { class: 'l1' }, `${t('flat.owner')}: ${f.owner.name || '-'}`),
          h('span', { class: 'l2' }, f.tenant ? `${t('flat.tenant')}: ${f.tenant.name || '-'}` : t('flat.noTenant'))),
        h('span', { class: `famt ${f.rate ? '' : 'missing'}` }, f.rate ? fmt(f.rate) : t('flat.noAmountShort'))));
  });

  const selBtn = h('button', { type: 'button', class: 'btn', onclick: () => rateDialog([...selected]) });
  const allBtn = h('button', { type: 'button', class: 'btn', disabled: flats.length === 0, onclick: () => rateDialog('all') }, t('rate.setAll'));
  const master = h('input', { type: 'checkbox', 'aria-label': t('flat.selectAll') });
  function refreshBar() {
    selBtn.textContent = t('rate.setSelected', { n: selected.size });
    selBtn.disabled = selected.size === 0;
    master.checked = flats.length > 0 && selected.size === flats.length;
  }
  master.addEventListener('change', () => {
    selected.clear(); if (master.checked) flats.forEach((f) => selected.add(f.id));
    rows.forEach((r) => { r.querySelector('input').checked = master.checked; }); refreshBar();
  });
  refreshBar();

  return h('article', { class: 'card c-flats' },
    h('header', { class: 'card-head' }, h('h2', null, t('flat.title')),
      h('div', { class: 'btn-row tight' },
        h('button', { type: 'button', class: 'btn', onclick: () => bulkDialog() }, t('bulk.open')),
        h('button', { type: 'button', class: 'btn primary', onclick: () => flatDialog(null) }, icon('plus'), t('flat.add')))),
    flats.length ? h('div', { class: 'bar' }, h('label', { class: 'pick' }, master), selBtn, allBtn) : null,
    flats.length ? h('div', { class: 'flist' }, rows) : h('p', { class: 'empty' }, t('flat.none')),
    flats.length ? h('p', { class: 'hint' }, t('flat.tapToEdit')) : null);
}

// ---- backup ------------------------------------------------------------------
async function pickFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null));
    input.addEventListener('cancel', () => resolve(null));
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 60000);
  });
}

function restoreFlow() {
  return async () => {
    const file = await pickFile();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast(t('err.too_big'), 'bad'); return; }
    let text;
    try { text = await file.text(); } catch (e) { toast(t('err.unknown'), 'bad'); return; }
    const p = svc.previewImport(text);
    if (!p.ok) {
      const first = p.errors.slice(0, 6);
      const known = first.length === 1 && ['empty', 'too_big', 'not_json', 'not_object', 'wrong_app', 'bad_version', 'newer_version'].includes(first[0]);
      const m = modal(t('set.restoreFailed'), h('div', null,
        h('p', { class: 'msg' }, known ? t(`err.${first[0]}`) : t('set.restoreInvalid')),
        known ? null : h('ul', { class: 'errs' }, first.map((c) => h('li', null, c))),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.close')))));
      return;
    }
    const ok = await confirmBox(t('set.restoreConfirm', { society: p.summary.society, months: p.summary.months, flats: p.summary.flats }), { ok: t('set.restoreDo'), danger: true });
    if (!ok) return;
    try { await svc.applyImport(p.doc); toast(t('set.restored')); } catch (e) { toast(errText(e), 'bad'); }
  };
}

function backupCard() {
  const meta = svc.getMeta();
  const undo = h('button', { type: 'button', class: 'btn', hidden: true, onclick: async () => {
    if (!(await confirmBox(t('set.undoConfirm'), { ok: t('set.undoDo'), danger: true }))) return;
    try { await svc.restorePrevious(); toast(t('set.restored')); } catch (e) { toast(errText(e), 'bad'); }
  } }, t('set.undo'));
  svc.hasPrevious().then((has) => { undo.hidden = !has; }).catch(() => {});
  return h('article', { class: 'card c-bak' },
    h('header', { class: 'card-head' }, h('h2', null, t('set.backupTitle'))),
    svc.isVolatile() ? h('p', { class: 'banner warn' }, t('set.volatile')) : null,
    h('p', { class: 'hint' }, t('set.whereSaved')),
    meta.dirty > 0 ? h('p', { class: 'banner warn' }, t('set.dirty', { n: meta.dirty })) : null,
    h('div', { class: 'btn-row wrap' },
      h('button', { type: 'button', class: 'btn primary', onclick: async () => {
        try {
          const { text, filename } = await svc.exportBackup();
          const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
          const a = h('a', { href: url, download: filename });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          toast(t('set.exported'));
        } catch (e) { toast(t('err.unknown'), 'bad'); }
      } }, icon('share'), t('set.export')),
      h('button', { type: 'button', class: 'btn', onclick: restoreFlow() }, t('set.restore')),
      undo),
    h('p', { class: 'hint' }, meta.lastBackupAt ? t('set.lastBackup', { date: shortDate(meta.lastBackupAt) + ' ' + meta.lastBackupAt.slice(0, 4) }) : t('set.neverBackedUp')));
}

export function renderSettings() {
  return h('section', { class: 'page' }, h('h1', null, t('set.title')), h('div', { class: 'cards settings' }, societyCard(), flatsCard(), backupCard()));
}
