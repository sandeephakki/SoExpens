// ui/backup.js — saving a backup file (share sheet, download, or copy), restoring one, and the top reminder bar.
// Rules: remind after every 5 changes; closing a month REQUIRES a backup (the dialog cannot be dismissed until saved).
import { h, icon, toast } from '../core/dom.js';
import { t, errText } from '../core/i18n.js';
import { modal, confirmBox } from '../core/dialog.js';
import { copyText } from '../core/share.js';
import * as svc from '../bal/service.js';

function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function fileFor(text, filename) {
  try { return new File([text], filename, { type: 'application/json' }); } catch (e) { return null; }
}
export function canShareFile() {
  try {
    const f = fileFor('{}', 'x.json');
    return !!(f && navigator.canShare && navigator.canShare({ files: [f] }));
  } catch (e) { return false; }
}

// required = true: Esc / tapping outside do nothing and "Done" stays off until a backup is really saved.
export function openBackup({ required = false } = {}) {
  let saved = false;
  const status = h('p', { class: 'banner info', role: 'status' }, t('bk.notSaved'));
  const done = h('button', { type: 'button', class: 'btn primary', disabled: required, onclick: () => m.close() }, required ? t('bk.done') : t('common.close'));

  const markSaved = async (how) => {
    try { await svc.markBackedUp(); } catch (e) { toast(errText(e), 'bad'); return; }
    saved = true; m.setDismissable(true); done.disabled = false;
    status.className = 'banner ok'; status.textContent = t(`bk.saved.${how}`);
  };
  const make = () => { try { return svc.prepareBackup(); } catch (e) { toast(t('bk.failed'), 'bad'); return null; } };

  const buttons = [];
  if (canShareFile()) {
    buttons.push(h('button', { type: 'button', class: 'btn primary block', onclick: async () => {
      const b = make(); if (!b) return;
      try { await navigator.share({ files: [fileFor(b.text, b.filename)], title: b.filename }); await markSaved('share'); }
      catch (e) { if (!(e && e.name === 'AbortError')) toast(t('bk.failed'), 'bad'); }
    } }, icon('share'), t('bk.share')));
  }
  buttons.push(h('button', { type: 'button', class: `btn block ${buttons.length ? '' : 'primary'}`, onclick: async () => {
    const b = make(); if (!b) return; download(b.text, b.filename); await markSaved('download');
  } }, t('bk.download')));
  buttons.push(h('button', { type: 'button', class: 'btn block', onclick: async () => {
    const b = make(); if (!b) return;
    if (await copyText(b.text)) await markSaved('copy'); else toast(t('bk.failed'), 'bad');
  } }, t('bk.copy')));

  const body = h('div', { class: 'form' },
    h('p', { class: 'msg' }, t(required ? 'bk.requiredBody' : 'bk.body')),
    h('p', { class: 'hint' }, t('bk.whereToKeep')),
    h('div', { class: 'stackbtns' }, buttons),
    h('p', { class: 'hint' }, t('bk.copyHint')),
    status,
    h('div', { class: 'btn-row' }, done));
  const m = modal(t(required ? 'bk.requiredTitle' : 'bk.title'), body, { dismissable: !required });
  return { isSaved: () => saved };
}

// ---- restore -------------------------------------------------------------------
function pickFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null));
    input.addEventListener('cancel', () => resolve(null));
    document.body.append(input);
    input.click();
    setTimeout(() => input.remove(), 60000);
  });
}

export async function restoreBackupFlow() {
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
}

// ---- the bar at the top of every screen -------------------------------------------
export function backupBar() {
  const s = svc.getBackupState();
  if (!s.kind) return null;
  const due = s.kind === 'due';
  return h('div', { class: 'banner warn top bar', role: 'status' },
    h('span', null, due ? t('bk.barDue') : t('bk.barRemind', { n: s.dirty })),
    h('span', { class: 'bar-actions' },
      h('button', { type: 'button', class: 'btn slim primary', onclick: () => openBackup({ required: due }) }, t('bk.now')),
      due ? null : h('button', { type: 'button', class: 'btn slim', onclick: () => svc.snoozeReminder() }, t('bk.later'))));
}
