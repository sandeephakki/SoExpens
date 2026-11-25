// ui/dashboard.js — card 1 (this month's report) and card 2 (add expense).
// Talks to BAL only.

import { h, icon, toast } from '../core/dom.js';
import { t, errText } from '../core/i18n.js';
import { modal, confirmBox } from '../core/dialog.js';
import * as svc from '../bal/service.js';
import { fmt, shortDate, monthLabel } from '../bal/month-calc.js';
import { openExport } from './export-view.js';
import { monthPicker } from './months.js';

function chip(status) {
  return h('span', { class: `chip ${status}` }, t(status === 'closed' ? 'status.closed' : 'status.open'));
}

function amountCell(e) {
  return e.amount === null ? h('span', { class: 'chip pending' }, t('dash.pending')) : fmt(e.amount);
}

function ledgerRow(label, amount, { cls = '', onclick = null, sub = '' } = {}) {
  const inner = [h('span', { class: 'lbl' }, label, sub ? h('small', null, sub) : null), h('span', { class: 'amt' }, amount)];
  return onclick
    ? h('button', { type: 'button', class: `row tap ${cls}`, onclick }, inner)
    : h('div', { class: `row ${cls}` }, inner);
}

// ---- edit dialogs ------------------------------------------------------------
function editItem(monthId, kind, item) {
  const isExp = kind === 'expenses';
  const err = h('p', { class: 'err', role: 'alert' });
  const details = h('input', { type: 'text', value: item.details, maxlength: 60, required: true, autocomplete: 'off', 'aria-label': t('form.details') });
  const amount = h('input', { type: 'text', inputmode: 'numeric', value: item.amount === null ? '' : String(item.amount), placeholder: isExp ? t('form.amountBlankOk') : '', 'aria-label': t('form.amount') });
  const repeat = h('input', { type: 'checkbox', checked: item.repeat === true });
  const form = h('form', { class: 'form', novalidate: true },
    h('label', null, t('form.details'), details),
    h('label', null, t('form.amount'), amount),
    isExp ? h('label', { class: 'check' }, repeat, t('form.repeat')) : null,
    err,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        if (!(await confirmBox(t('dash.confirmDelete', { name: item.details }), { ok: t('common.delete'), danger: true }))) return;
        try { await svc.deleteItem(monthId, kind, item.id); m.close(); toast(t('toast.deleted')); } catch (e) { err.textContent = errText(e); }
      } }, t('common.delete')),
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('common.save'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    try {
      await svc.updateItem(monthId, kind, item.id, { details: details.value, amount: amount.value, ...(isExp ? { repeat: repeat.checked } : {}) });
      m.close(); toast(t('toast.saved'));
    } catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t(isExp ? 'dash.editExpense' : 'dash.editExtra'), form);
  details.focus();
}

function monthDetails(view, state) {
  const { month } = view;
  const open = month.status === 'open';
  const err = h('p', { class: 'err', role: 'alert' });
  const picker = monthPicker(month.id);
  const coll = h('input', { type: 'text', inputmode: 'numeric', value: String(month.collection.amount), 'aria-label': t('dash.collection') });
  const note = h('textarea', { rows: 3, maxlength: 500, 'aria-label': t('dash.note') }, month.note || '');
  note.value = month.note || '';

  const impactText = (p) => (p.before !== p.after ? ` ${t('dash.impact', { before: fmt(p.before), after: fmt(p.after) })}` : '');
  const form = h('form', { class: 'form', novalidate: true },
    h('fieldset', null, h('legend', null, t('dash.monthName')), picker.el, h('small', { class: 'hint' }, t('dash.monthNameHint'))),
    open ? h('div', { class: 'form' },
      h('label', null, t('dash.collection'), coll),
      h('p', { class: 'hint' }, view.collectionText),
      h('label', null, t('dash.note'), note),
      h('p', { class: 'hint' }, t('dash.noteHint')),
      h('button', { type: 'button', class: 'btn', onclick: async () => {
        try { await svc.recalcCollection(month.id); m.close(); toast(t('toast.recalculated')); } catch (e) { err.textContent = errText(e); }
      } }, t('dash.recalc')),
      h('p', { class: 'hint' }, t('dash.recalcHint'))) : h('p', { class: 'hint' }, t('dash.closedDetailsHint')),
    err,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        err.textContent = '';
        let p;
        try { p = svc.previewChange('delete', month.id); } catch (e) { err.textContent = errText(e); return; }
        const msg = t('dash.confirmDeleteMonth', { month: view.label }) + (open ? '' : ` ${t('dash.closedWarn')}`) + impactText(p);
        if (!(await confirmBox(msg, { ok: t('common.delete'), danger: true }))) return;
        try { await svc.deleteMonth(month.id); state.monthId = null; m.close(); toast(t('toast.deleted')); } catch (e) { err.textContent = errText(e); }
      } }, t('dash.deleteMonth')),
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('common.save'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try {
      let id = month.id;
      const wanted = picker.value();
      if (wanted !== month.id) {
        const p = svc.previewChange('rename', month.id, wanted);
        const msg = t('dash.confirmRename', { from: view.label, to: monthLabel(wanted) }) + impactText(p);
        if (!(await confirmBox(msg, { ok: t('dash.rename') }))) return;
        await svc.renameMonth(month.id, wanted); id = wanted; state.monthId = wanted;
      }
      if (open) await svc.saveMonthMeta(id, { collectionAmount: coll.value, note: note.value });
      m.close(); toast(t('toast.saved'));
    } catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t('dash.monthDetails', { month: view.label }), form);
}

// ---- card 1 ------------------------------------------------------------------
function reportCard(view, state) {
  const { month, calc } = view;
  const open = month.status === 'open';
  const rows = month.expenses.map((e, i) => ledgerRow(`${i + 1}. ${e.details}`, amountCell(e), {
    sub: e.date ? shortDate(e.date) : '', onclick: open ? () => editItem(month.id, 'expenses', e) : null,
  }));

  const extras = month.extraIncome.map((x) => ledgerRow(
    x.details, `+ ${fmt(x.amount)}`, { cls: 'plus', sub: x.kind === 'adjustment' ? t('dash.adjustment') : (x.date ? shortDate(x.date) : ''), onclick: open ? () => editItem(month.id, 'extraIncome', x) : null }));

  return h('article', { class: 'card report' },
    h('header', { class: 'card-head' }, h('h2', null, t('dash.thisMonth')), chip(month.status)),
    rows.length ? h('div', { class: 'ledger' }, rows) : h('p', { class: 'empty' }, t('dash.noExpenses')),
    ledgerRow(t('dash.totalSpent'), fmt(calc.spent), { cls: 'sum' }),
    h('div', { class: 'ledger summary' },
      ledgerRow(view.collectionText, `+ ${fmt(month.collection.amount)}`, { cls: 'plus' }),
      extras,
      ledgerRow(t('dash.balance'), (calc.balance < 0 ? '- ' : '+ ') + fmt(Math.abs(calc.balance)), { cls: `strong ${calc.balance < 0 ? 'neg' : ''}` }),
      ledgerRow(t('dash.opening'), fmt(calc.opening))),
    h('div', { class: `hero ${calc.closing < 0 ? 'neg' : ''}` },
      h('span', { class: 'hero-lbl' }, t('dash.closing', { month: view.nextLabel })),
      h('span', { class: 'hero-num' }, fmt(calc.closing))),
    h('p', { class: 'carry' }, view.carryLine),
    view.gap ? h('p', { class: 'banner info' }, t('dash.gap', { prev: view.gap.prevLabel, n: view.gap.missing })) : null,
    month.note ? h('p', { class: 'note' }, month.note) : null,
    calc.closing < 0 ? h('p', { class: 'banner warn', role: 'alert' }, t('dash.negativeSavings')) : null,
    calc.pending > 0 ? h('p', { class: 'banner info' }, t('dash.pendingNote', { n: calc.pending })) : null,
    h('div', { class: 'btn-row wrap' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => openExport(month.id) }, icon('share'), t('dash.export')),
      h('button', { type: 'button', class: 'btn', onclick: () => monthDetails(view, state) }, t('dash.details')),
      open
        ? h('button', { type: 'button', class: 'btn', onclick: async () => {
          if (!(await confirmBox(t('dash.confirmClose', { month: view.label }), { ok: t('dash.close') }))) return;
          try { await svc.closeMonth(month.id); toast(t('toast.closed')); } catch (e) { toast(errText(e), 'bad'); }
        } }, t('dash.close'))
        : h('button', { type: 'button', class: 'btn', onclick: async () => {
          try { await svc.unlockMonth(month.id); toast(t('toast.unlocked')); } catch (e) { toast(errText(e), 'bad'); }
        } }, t('dash.unlock'))));
}

// ---- card 2 ------------------------------------------------------------------
function addCard(view) {
  const { month } = view;
  if (month.status === 'closed') {
    return h('article', { class: 'card add' },
      h('header', { class: 'card-head' }, h('h2', null, t('dash.addTitle'))),
      h('p', { class: 'empty' }, t('dash.closedHint')));
  }
  const err = h('p', { class: 'err', role: 'alert' });
  const kind = h('select', { 'aria-label': t('form.type') },
    h('option', { value: 'expenses' }, t('form.typeExpense')),
    h('option', { value: 'extraIncome' }, t('form.typeExtra')));
  const details = h('input', { type: 'text', maxlength: 60, autocomplete: 'off', placeholder: t('form.detailsPh'), 'aria-label': t('form.details') });
  const amount = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: t('form.amountPh'), 'aria-label': t('form.amount') });
  const repeat = h('input', { type: 'checkbox' });
  const repeatRow = h('label', { class: 'check' }, repeat, t('form.repeat'));
  const submit = h('button', { type: 'submit', class: 'btn primary block' }, icon('plus'), t('dash.addBtn'));
  kind.addEventListener('change', () => { repeatRow.hidden = kind.value !== 'expenses'; });
  const form = h('form', { class: 'form', novalidate: true },
    h('label', null, t('form.type'), kind),
    h('label', null, t('form.details'), details),
    h('label', null, t('form.amount'), amount),
    repeatRow, err, submit);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    submit.disabled = true;
    try {
      const v = { details: details.value, amount: amount.value };
      if (kind.value === 'expenses') await svc.addExpense(month.id, { ...v, repeat: repeat.checked });
      else await svc.addExtraIncome(month.id, v);
      toast(t('toast.added'));
    } catch (e) { err.textContent = errText(e); }
    finally { submit.disabled = false; }
  });
  return h('article', { class: 'card add' }, h('header', { class: 'card-head' }, h('h2', null, t('dash.addTitle'))), form);
}

// ---- page --------------------------------------------------------------------
export function renderDashboard(state, nav) {
  const months = svc.listMonths();
  if (!months.length) {
    return h('section', { class: 'page' },
      h('div', { class: 'card center' },
        h('h2', null, t('dash.emptyTitle')), h('p', { class: 'empty' }, t(svc.getDoc().flats.length ? 'dash.emptyBody' : 'dash.emptyNoFlats')),
        h('button', { type: 'button', class: 'btn primary', onclick: async () => {
          try { state.monthId = await svc.addMonth(); } catch (e) { toast(errText(e), 'bad'); }
        } }, t('months.add', { month: svc.suggestedNextMonth() }))));
  }
  if (!state.monthId || !months.some((m) => m.id === state.monthId)) state.monthId = months[months.length - 1].id;
  const idx = months.findIndex((m) => m.id === state.monthId);
  const view = svc.getMonthView(state.monthId);
  const go = (d) => { state.monthId = months[idx + d].id; nav.refresh(); };
  return h('section', { class: 'page' },
    h('div', { class: 'monthbar' },
      h('button', { type: 'button', class: 'btn icon', 'aria-label': t('dash.prev'), disabled: idx === 0, onclick: () => go(-1) }, icon('left')),
      h('button', { type: 'button', class: 'monthname', onclick: () => nav.go('months'), 'aria-label': t('dash.allMonths') }, view.label),
      h('button', { type: 'button', class: 'btn icon', 'aria-label': t('dash.next'), disabled: idx === months.length - 1, onclick: () => go(1) }, icon('right'))),
    h('div', { class: 'cards' }, reportCard(view, state), addCard(view)));
}
