// core/share.js — share the APP link (never any society data). Native share sheet when the phone has one,
// otherwise direct links for common apps + copy link.

export const FALLBACK_URL = 'https://sandeephakki.github.io/SoExpens/';

// The address this copy of the app is served from, without #hash or ?query (so a friend lands on the app itself).
export function appUrl() {
  try {
    const u = new URL('./', location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') { u.hash = ''; u.search = ''; return u.href; }
  } catch (e) { /* not in a browser page */ }
  return FALLBACK_URL;
}

const enc = encodeURIComponent;

// One link per app. Every value is encoded, so spaces, '&', '#', emoji or non-English text cannot break a link.
export function shareTargets(url, text, title) {
  return [
    { id: 'whatsapp', href: `https://wa.me/?text=${enc(`${text} ${url}`)}` },
    { id: 'telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
    { id: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { id: 'x', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
    { id: 'linkedin', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { id: 'email', href: `mailto:?subject=${enc(title)}&body=${enc(`${text}\n\n${url}`)}` },
    { id: 'sms', href: `sms:?&body=${enc(`${text} ${url}`)}` },
  ];
}

// 'shared' | 'cancelled' | 'unsupported'
export async function nativeShare({ title, text, url }) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported';
  try {
    await navigator.share({ title, text, url });
    return 'shared';
  } catch (e) {
    return e && e.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

// true when the text is on the clipboard.
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall through to the old way */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
