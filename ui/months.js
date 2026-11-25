// ui/months.js — all months (newest first), add next month, add ANY month (past / present / future).
import { h, icon, toast } from '../core/dom.js';
import { t, errText } from '../core/i18n.js';
import { modal } from '../core/dialog.js';
import * as svc from '../bal/service.js';
import { fmt, monthLabel, monthsBetween, MONTH_NAMES } from '../bal/month-calc.js';

// Month name + 4-digit year. Works on every browser (no <input type="month">).
export function monthPicker(initialId) {
  const [y, m] = initialId.split('-');
  const month = h('select', { 'aria-label': t('picker.month') }, MONTH_NAMES.map((n, i) => h('option', { value: String(i + 1) }, n)));
  month.value = String(Number(m));
  const year = h('input', { type: 'text', inputmode: 'numeric', maxlength: 4, value: y, 'aria-label': t('picker.year'), autocomplete: 'off' });
  return {
    el: h('div', { class: 'two' }, h('label', null, t('picker.month'), month), h('label', null, t('picker.year'), year)),
    value: () => `${year.value.trim()}-${month.value.padStart(2, '0')}`,
    onchange: (fn) => { month.addEventListener('change', fn); year.addEventListener('input', fn); },
    focus: () => year.focus(),
  };
}

function addAnyDialog(state, nav, startId) {
  const picker = monthPicker(startId);
  const err = h('p', { class: 'err', role: 'alert' });
  const info = h('p', { class: 'hint' });
  const submit = h('button', { type: 'submit', class: 'btn primary' }, t('months.addThis'));
  const update = () => {
    err.textContent = ''; info.textContent = '';
    try {
      const id = picker.value();
      const p = svc.previewChange('add', id);
      const bits = [];
      if (p.becomesFirst) bits.push(t('months.becomesFirst', { month: monthLabel(id), start: fmt(p.startingSavings) }));
      if (id > svc.todayIso().slice(0, 7)) bits.push(t('months.isFuture'));
      info.textContent = bits.join(' ');
      submit.disabled = false;
    } catch (e) { err.textContent = errText(e); submit.disabled = true; }
  };
  picker.onchange(update);
  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'msg' }, t('months.addAnyBody')), picker.el, info, err,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')), submit));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try { state.monthId = await svc.addMonthAt(picker.value()); m.close(); toast(t('toast.monthAdded')); nav.go('dashboard'); }
    catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t('months.addAnyTitle'), form);
  update(); picker.focus();
}

export function renderMonths(state, nav) {
  const list = svc.listMonths().reverse();
  const addBtn = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
    addBtn.disabled = true;
    try { state.monthId = await svc.addMonth(); toast(t('toast.monthAdded')); nav.go('dashboard'); }
    catch (e) { toast(errText(e), 'bad'); }
    finally { addBtn.disabled = false; }
  } }, icon('plus'), t('months.add', { month: svc.suggestedNextMonth() }));
  const anyBtn = h('button', { type: 'button', class: 'btn', onclick: () => addAnyDialog(state, nav, svc.latestMonthId() ? svc.latestMonthId() : svc.todayIso().slice(0, 7)) }, t('months.addAny'));

  const rows = [];
  list.forEach((m, i) => {
    rows.push(h('button', { type: 'button', class: 'mrow', onclick: () => { state.monthId = m.id; nav.go('dashboard'); } },
      h('span', { class: 'mname' }, m.label, h('span', { class: `chip ${m.status}` }, t(m.status === 'closed' ? 'status.closed' : 'status.open'))),
      h('span', { class: 'mnums' },
        h('small', null, t('months.spent', { n: fmt(m.calc.spent) })),
        h('strong', { class: m.calc.closing < 0 ? 'neg' : '' }, fmt(m.calc.closing)))));
    const older = list[i + 1];
    if (older) {
      const missing = monthsBetween(older.id, m.id) - 1;
      if (missing > 0) rows.push(h('p', { class: 'gapnote' }, t('months.gap', { n: missing, from: older.label })));
    }
  });

  return h('section', { class: 'page' },
    h('h1', null, t('months.title')),
    h('div', { class: 'btn-row wrap tight-top' }, addBtn, anyBtn),
    list.length ? h('div', { class: 'card flush' }, rows) : h('p', { class: 'empty' }, t('months.none')));
}
