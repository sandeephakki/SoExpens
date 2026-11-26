// ui/export-view.js — preview the report image, then share to WhatsApp or save.
import { h, icon, toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { modal } from '../core/dialog.js';
import * as svc from '../bal/service.js';
import { drawReport } from './report-canvas.js';

function toBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image_failed'))), 'image/png'));
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function openExport(monthId) {
  let model;
  try { model = svc.getReport(monthId); } catch (e) { toast(t('err.unknown'), 'bad'); return; }
  const canvas = drawReport(model);
  canvas.className = 'preview';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('export.alt', { month: model.titleBold }));

  const shareBtn = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
    try {
      const blob = await toBlob(canvas);
      const file = new File([blob], model.fileName, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${model.society} - ${model.titleBold}` });
      } else {
        download(blob, model.fileName);
        toast(t('export.saved'));
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // user closed the share sheet
      toast(t('export.failed'), 'bad');
    }
  } }, icon('share'), t('export.share'));

  const saveBtn = h('button', { type: 'button', class: 'btn', onclick: async () => {
    try { download(await toBlob(canvas), model.fileName); toast(t('export.saved')); } catch (e) { toast(t('export.failed'), 'bad'); }
  } }, t('export.save'));

  const m = modal(t('export.title', { month: model.titleBold }), h('div', null,
    model.hasPending ? h('p', { class: 'banner info' }, t('export.pending')) : null,
    h('div', { class: 'preview-wrap' }, canvas),
    h('div', { class: 'btn-row wrap' }, h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.close')), saveBtn, shareBtn)));
}
