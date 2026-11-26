// core/i18n.js — every visible string goes through t('key'). Add a language = add i18n/<code>.json.

let messages = {};

export async function loadMessages(lang = 'en') {
  const res = await fetch(new URL(`../i18n/${lang}.json`, import.meta.url));
  if (!res.ok) throw new Error('i18n_load_failed');
  messages = await res.json();
}
export function setMessages(obj) { messages = obj; }

export function t(key, vars) {
  let s = messages[key];
  if (s === undefined) { console.warn('missing i18n key', key); return key; }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// Error -> friendly text. Stable error codes come from BAL.
export function errText(e) {
  const code = e && e.message ? e.message : '';
  return Object.prototype.hasOwnProperty.call(messages, `err.${code}`) ? t(`err.${code}`) : t('err.unknown');
}
