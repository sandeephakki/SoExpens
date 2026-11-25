// core/dialog.js — modal helpers on the native <dialog> element.
import { h } from './dom.js';
import { t } from './i18n.js';

export function modal(title, content) {
  const dlg = h('dialog', { class: 'modal', 'aria-label': title },
    h('div', { class: 'modal-body' }, h('h2', null, title), content));
  const close = () => { if (dlg.open) dlg.close(); dlg.remove(); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  return { el: dlg, close };
}

export function confirmBox(message, { ok = t('common.ok'), danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    const body = h('div', null,
      h('p', { class: 'msg' }, message),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => finish(false) }, t('common.cancel')),
        h('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => finish(true) }, ok)));
    const m = modal(t('common.confirm'), body);
    m.el.addEventListener('close', () => finish(false));
  });
}
