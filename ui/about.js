// ui/about.js — About card (last card in Settings): the app, share-the-app options, and who built it.
import { h, icon, toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { modal } from '../core/dialog.js';
import { appUrl, shareTargets, nativeShare, copyText } from '../core/share.js';

const AUTHOR = {
  site: 'https://www.hakki.in/',
  apps: 'https://hakki.in/#store',
  linkedin: 'https://www.linkedin.com/in/sandeep-s-hakki-83174022/',
  email: 'mailto:sandeep@hakki.in',
};

const ext = (href, label, cls) => h('a', { class: `btn slim ${cls || ''}`, href, target: '_blank', rel: 'noopener noreferrer' }, label);

async function copyLink(url) {
  if (await copyText(url)) { toast(t('about.copied')); return; }
  toast(t('about.copyFailed'), 'bad');
}

// Used when the phone/browser has no native share sheet (most desktops).
function shareDialog(url) {
  const text = t('about.shareText');
  const title = t('about.shareSubject');
  const field = h('input', { type: 'text', readonly: true, value: url, 'aria-label': t('about.link') });
  field.addEventListener('focus', () => field.select());
  const body = h('div', { class: 'form' },
    h('p', { class: 'msg' }, t('about.shareDialogBody')),
    h('label', null, t('about.link'), field),
    h('div', { class: 'sharegrid' },
      shareTargets(url, text, title).map((s) => h('a', { class: 'btn slim', href: s.href, target: '_blank', rel: 'noopener noreferrer' }, t(`share.${s.id}`)))),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => m.close() }, t('common.close')),
      h('button', { type: 'button', class: 'btn primary', onclick: () => copyLink(url) }, t('about.copy'))));
  const m = modal(t('about.shareTitle'), body);
}

async function onShare() {
  const url = appUrl();
  const r = await nativeShare({ title: t('about.shareSubject'), text: t('about.shareText'), url });
  if (r === 'unsupported') shareDialog(url);
}

export function aboutCard() {
  const url = appUrl();
  return h('article', { class: 'card about' },
    h('div', { class: 'about-app' },
      h('img', { class: 'about-logo', src: 'img/icon-192.png', alt: '', width: 56, height: 56 }),
      h('div', null, h('h2', null, t('app.name')), h('p', { class: 'hint' }, t('about.tagline')))),
    h('p', { class: 'msg' }, t('about.shareHint')),
    h('div', { class: 'btn-row wrap tight-top' },
      h('button', { type: 'button', class: 'btn primary', onclick: onShare }, icon('share'), t('about.share')),
      h('button', { type: 'button', class: 'btn', onclick: () => copyLink(url) }, t('about.copy'))),
    h('p', { class: 'urlline' }, url),
    h('section', { class: 'author', 'aria-label': t('about.builtBy') },
      h('img', { class: 'author-photo', src: 'img/author-160.png', alt: t('about.photoAlt'), width: 84, height: 84 }),
      h('div', { class: 'author-body' },
        h('p', { class: 'kicker' }, t('about.builtBy')),
        h('p', { class: 'author-name' }, t('about.name')),
        h('p', { class: 'author-role' }, t('about.role')),
        h('p', { class: 'author-bio' }, t('about.bio')),
        h('div', { class: 'author-links' },
          ext(AUTHOR.site, t('about.website'), 'site'), ext(AUTHOR.linkedin, 'LinkedIn', 'li'),
          h('a', { class: 'btn slim mail', href: AUTHOR.email }, t('about.email')), ext(AUTHOR.apps, t('about.moreApps'), 'apps')))),
    h('p', { class: 'hint fine' }, t('about.privacy')));
}
