// core/app.js — boot, router, shell. One page, three views, hash routing.
import { h, icon, toast } from './dom.js';
import { loadMessages, t } from './i18n.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { setRegistration } from './update.js';
import { createDefaultStore, requestPersistence } from '../dal/store.js';
import * as svc from '../bal/service.js';
import { renderDashboard } from '../ui/dashboard.js';
import { renderMonths } from '../ui/months.js';
import { renderSettings } from '../ui/settings.js';

const ROUTES = ['dashboard', 'months', 'settings'];
const state = { monthId: null };
let root;
let view;
let navEl;

function currentRoute() {
  const r = location.hash.replace('#', '');
  return ROUTES.includes(r) ? r : 'dashboard';
}

const nav = {
  go(r) { if (currentRoute() === r) render(); else location.hash = r; },
  refresh() { render(); },
};

function banners() {
  const out = [];
  const err = svc.getLoadError();
  if (err) out.push(h('p', { class: 'banner warn top', role: 'alert' }, t('app.loadError')));
  if (svc.isVolatile()) out.push(h('p', { class: 'banner warn top', role: 'alert' }, t('app.volatile')));
  return out;
}

function render() {
  const route = currentRoute();
  const page = route === 'months' ? renderMonths(state, nav) : route === 'settings' ? renderSettings(state, nav) : renderDashboard(state, nav);
  view.replaceChildren(...banners(), page);
  navEl.querySelectorAll('a').forEach((a) => {
    const on = a.dataset.route === route;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${t('app.name')} · ${svc.getDoc().settings.societyName}`;
  const soc = root.querySelector('.brand .soc');
  if (soc) soc.textContent = svc.getDoc().settings.societyName;
  const sv = root.querySelector('.brand .saved');
  if (sv) {
    const m = svc.getMeta();
    sv.className = `saved ${m.dirty > 0 ? 'dirty' : ''}`;
    sv.textContent = m.dirty > 0 ? t('app.savedDirty', { n: m.dirty }) : t('app.saved');
  }
  window.scrollTo(0, 0);
}

function shell() {
  const link = (r, ic, label) => h('a', { href: `#${r}`, 'data-route': r }, icon(ic), h('span', null, label));
  navEl = h('nav', { class: 'nav', 'aria-label': t('app.nav') },
    link('dashboard', 'home', t('nav.dashboard')), link('months', 'list', t('nav.months')), link('settings', 'gear', t('nav.settings')));
  view = h('main', { class: 'view', id: 'main' });
  root.replaceChildren(
    h('header', { class: 'top' }, h('div', { class: 'brand' }, h('strong', null, t('app.name')), h('span', { class: 'soc' }, svc.getDoc().settings.societyName), h('small', { class: 'saved' }))),
    h('div', { class: 'frame' }, navEl, view));
}

let queued = false;
function scheduleRender() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    render();
  });
}

// A new service worker took over: offer a refresh (never reload by itself, you may be typing).
function showUpdateBar() {
  if (document.getElementById('update-bar')) return;
  document.body.append(h('div', { id: 'update-bar', class: 'update-bar', role: 'status' },
    h('span', null, t('app.updateReady')),
    h('button', { type: 'button', class: 'btn primary', onclick: () => location.reload() }, t('app.refresh'))));
}

function watchForUpdates(reg) {
  setRegistration(reg);
  const hadController = !!navigator.serviceWorker.controller; // false on the very first install: nothing to refresh
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBar(); });
  const check = () => reg.update().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 60 * 60 * 1000);
}

async function boot() {
  applyTheme(); watchSystemTheme();
  root = document.getElementById('app');
  try {
    await loadMessages('en');
    await svc.init(createDefaultStore());
  } catch (e) {
    root.textContent = 'SoExpens could not start. Reload the page. If it keeps failing, clear site data and restore your backup.';
    console.error(e);
    return;
  }
  requestPersistence();
  shell();
  svc.subscribe(scheduleRender);
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(watchForUpdates).catch((e) => console.warn('sw failed', e));
  }
}

boot();
