// ui/special.js — special collections: a one-time amount asked from chosen flats (new motor, civil work).
// Paid flats add to this month's income. The real cost is a normal expense; leftover stays in savings.
import { h, icon, toast } from '../core/dom.js';
import { t, errText } from '../core/i18n.js';
import { modal, confirmBox } from '../core/dialog.js';
import * as svc from '../bal/service.js';
import { fmt, shortDate } from '../bal/month-calc.js';

const field = (label, input, hint) => h('label', null, label, input, hint ? h('small', { class: 'hint' }, hint) : null);

// ---- create --------------------------------------------------------------------
export function createSpecial(monthId, onDone) {
  const flats = svc.getDoc().flats;
  if (!flats.length) { toast(t('sp.needFlats'), 'bad'); return; }
  const err = h('p', { class: 'err', role: 'alert' });
  const title = h('input', { type: 'text', maxlength: 60, autocomplete: 'off', placeholder: t('sp.titlePh'), 'aria-label': t('sp.title') });
  const amount = h('input', { type: 'text', inputmode: 'numeric', placeholder: '4000', 'aria-label': t('sp.amount') });
  const boxes = flats.map((f) => ({ f, el: h('input', { type: 'checkbox', checked: true, 'aria-label': f.label }) }));
  const total = h('p', { class: 'hint', role: 'status' });
  const all = h('input', { type: 'checkbox', checked: true, 'aria-label': t('flat.selectAll') });
  const upd = () => {
    const n = boxes.filter((b) => b.el.checked).length;
    const a = Number(String(amount.value).replace(/,/g, ''));
    total.textContent = Number.isInteger(a) && a > 0 ? t('sp.expected', { n, total: fmt(n * a) }) : t('sp.picked', { n });
    all.checked = n === boxes.length;
  };
  boxes.forEach((b) => b.el.addEventListener('change', upd));
  amount.addEventListener('input', upd);
  all.addEventListener('change', () => { boxes.forEach((b) => { b.el.checked = all.checked; }); upd(); });
  upd();
  const form = h('form', { class: 'form', novalidate: true },
    h('p', { class: 'msg' }, t('sp.createBody')),
    field(t('sp.title'), title), field(t('sp.amount'), amount, t('sp.amountHint')),
    h('div', { class: 'bar' }, h('label', { class: 'pick' }, all), h('strong', null, t('sp.whoPays'))),
    h('div', { class: 'flist' }, boxes.map((b) => h('label', { class: 'frow pickrow' }, h('span', { class: 'pick' }, b.el), h('span', { class: 'fbadge' }, b.f.label), h('span', { class: 'finfo' }, h('span', { class: 'l1' }, b.f.owner.name || '-'))))),
    total, err,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('sp.create'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try {
      await svc.addSpecial(monthId, { title: title.value, amount: amount.value, flatIds: boxes.filter((b) => b.el.checked).map((b) => b.f.id) });
      m.close(); toast(t('toast.added'));
      const view = svc.getMonthView(monthId);
      const made = view.specials[view.specials.length - 1];
      if (made && onDone) onDone(made.id);
    } catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t('sp.newTitle'), form);
  title.focus();
}

// ---- small dialogs -------------------------------------------------------------
function lineDialog(monthId, sp, line, refresh) {
  const err = h('p', { class: 'err', role: 'alert' });
  const amount = h('input', { type: 'text', inputmode: 'numeric', value: String(line.amount), 'aria-label': t('sp.amount') });
  const form = h('form', { class: 'form', novalidate: true },
    field(t('sp.lineAmount', { label: line.label }), amount), err,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        if (!(await confirmBox(t('sp.confirmRemove', { label: line.label }), { ok: t('sp.remove'), danger: true }))) return;
        try { await svc.removeLine(monthId, sp.id, line.id); m.close(); refresh(); } catch (e) { err.textContent = errText(e); }
      } }, t('sp.remove')),
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('common.save'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try { await svc.updateLine(monthId, sp.id, line.id, { amount: amount.value }); m.close(); refresh(); } catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t('sp.editLine'), form);
  amount.select();
}

function addFlatDialog(monthId, sp, refresh) {
  const have = new Set(sp.lines.map((l) => l.flatId));
  const missing = svc.getDoc().flats.filter((f) => !have.has(f.id));
  if (!missing.length) { toast(t('sp.noMissing')); return; }
  const err = h('p', { class: 'err', role: 'alert' });
  const pick = h('select', { 'aria-label': t('sp.pickFlat') }, missing.map((f) => h('option', { value: f.id }, f.label)));
  const amount = h('input', { type: 'text', inputmode: 'numeric', value: String(sp.lines[0] ? sp.lines[0].amount : ''), 'aria-label': t('sp.amount') });
  const form = h('form', { class: 'form', novalidate: true },
    field(t('sp.pickFlat'), pick), field(t('sp.amount'), amount), err,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('sp.addFlat'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try { await svc.addLine(monthId, sp.id, { flatId: pick.value, amount: amount.value }); m.close(); refresh(); } catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t('sp.addFlat'), form);
}

function editDialog(monthId, sp, refresh) {
  const err = h('p', { class: 'err', role: 'alert' });
  const title = h('input', { type: 'text', value: sp.title, maxlength: 60, autocomplete: 'off', 'aria-label': t('sp.title') });
  const note = h('textarea', { rows: 3, maxlength: 500, 'aria-label': t('dash.note') }, sp.note || '');
  note.value = sp.note || '';
  const form = h('form', { class: 'form', novalidate: true }, field(t('sp.title'), title), field(t('dash.note'), note), err,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.cancel')),
      h('button', { type: 'submit', class: 'btn primary' }, t('common.save'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try { await svc.updateSpecial(monthId, sp.id, { title: title.value, note: note.value }); m.close(); refresh(); } catch (e) { err.textContent = errText(e); }
  });
  const m = modal(t('sp.editTitle'), form);
}

// ---- the collection itself: who paid, who is pending -----------------------------
export function openSpecial(monthId, specialId) {
  const body = h('div');
  const first = svc.getMonthView(monthId);
  const sp0 = first && first.specials.find((x) => x.id === specialId);
  if (!sp0) return;
  const m = modal(sp0.title, body);
  const heading = m.el.querySelector('h2');
  const refresh = () => {
    const view = svc.getMonthView(monthId);
    const sp = view && view.specials.find((x) => x.id === specialId);
    if (!sp) { m.close(); return; }
    heading.textContent = sp.title;
    const open = view.month.status === 'open';
    const st = sp.stats;
    const busy = new Set();
    const rows = sp.lines.map((l) => {
      const box = h('input', { type: 'checkbox', checked: l.paid, disabled: !open, 'aria-label': t('sp.paidAria', { label: l.label }) });
      box.addEventListener('change', async () => {
        if (busy.has(l.id)) return; busy.add(l.id); box.disabled = true;
        try { await svc.setLinePaid(monthId, sp.id, l.id, box.checked); } catch (e) { toast(errText(e), 'bad'); }
        refresh();
      });
      return h('div', { class: `frow payrow ${l.paid ? 'paid' : ''}` },
        h('label', { class: 'pick' }, box),
        h('span', { class: 'fbadge' }, l.label),
        h('span', { class: 'finfo' }, h('span', { class: 'l1' }, l.paid ? t('sp.paid') : t('sp.notPaid')), l.paid && l.paidOn ? h('span', { class: 'l2' }, shortDate(l.paidOn)) : null),
        h('button', { type: 'button', class: 'btn slim', disabled: !open, 'aria-label': t('sp.editLine'), onclick: () => lineDialog(monthId, sp, l, refresh) }, fmt(l.amount)));
    });
    body.replaceChildren(...[
      h('div', { class: 'tile' },
        h('span', { class: 'tile-lbl' }, t('sp.collected')),
        h('strong', { class: 'tile-num' }, fmt(st.collected)),
        h('span', { class: 'tile-sub' }, t('sp.progress', { paid: st.paidCount, total: st.total, expected: fmt(st.expected) }))),
      st.pending > 0 ? h('p', { class: 'banner warn' }, t('sp.pendingList', { n: st.pending, names: sp.lines.filter((l) => !l.paid).map((l) => l.label).join(', ') })) : h('p', { class: 'banner info' }, t('sp.allPaid')),
      h('div', { class: 'flist' }, rows),
      sp.note ? h('p', { class: 'note' }, sp.note) : null,
      h('p', { class: 'hint' }, open ? t('sp.hint') : t('sp.closedHint')),
      h('div', { class: 'btn-row wrap' },
        open && st.pending > 0 ? h('button', { type: 'button', class: 'btn primary', onclick: async () => {
          try { await svc.markAllPaid(monthId, sp.id); toast(t('toast.saved')); } catch (e) { toast(errText(e), 'bad'); } refresh();
        } }, t('sp.markAll')) : null,
        open ? h('button', { type: 'button', class: 'btn', onclick: () => addFlatDialog(monthId, sp, refresh) }, t('sp.addFlat')) : null,
        open ? h('button', { type: 'button', class: 'btn', onclick: () => editDialog(monthId, sp, refresh) }, t('common.edit')) : null),
      h('div', { class: 'btn-row' },
        open ? h('button', { type: 'button', class: 'btn danger', onclick: async () => {
          if (!(await confirmBox(t('sp.confirmDelete', { title: sp.title }), { ok: t('common.delete'), danger: true }))) return;
          try { await svc.deleteSpecial(monthId, sp.id); m.close(); toast(t('toast.deleted')); } catch (e) { toast(errText(e), 'bad'); }
        } }, t('sp.delete')) : null,
        h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.close')))].filter(Boolean));
  };
  refresh();
}

// ---- dashboard card --------------------------------------------------------------
export function specialCard(view) {
  const open = view.month.status === 'open';
  const list = view.specials;
  return h('article', { class: 'card special' },
    h('header', { class: 'card-head' }, h('h2', null, t('sp.cardTitle')),
      open ? h('button', { type: 'button', class: 'btn', onclick: () => createSpecial(view.month.id, (id) => openSpecial(view.month.id, id)) }, icon('plus'), t('sp.new')) : null),
    list.length ? list.map((sp) => h('button', { type: 'button', class: 'sprow', onclick: () => openSpecial(view.month.id, sp.id) },
      h('span', { class: 'spname' }, sp.title, sp.stats.pending > 0 ? h('span', { class: 'chip pending' }, t('sp.pendingChip', { n: sp.stats.pending })) : h('span', { class: 'chip open' }, t('sp.doneChip'))),
      h('span', { class: 'spnums' }, h('strong', null, fmt(sp.stats.collected)), h('small', null, t('sp.ofExpected', { expected: fmt(sp.stats.expected) }))))) : h('p', { class: 'empty' }, t('sp.empty')));
}
