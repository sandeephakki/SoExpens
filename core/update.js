// core/update.js — knows about the service worker registration so Settings can ask "is there a newer version?"
let reg = null;
export function setRegistration(r) { reg = r; }

// 'unsupported' | 'offline' | 'found' | 'current'
export async function checkForUpdate() {
  if (!reg) return 'unsupported';
  try { await reg.update(); } catch (e) { return 'offline'; }
  return reg.installing || reg.waiting ? 'found' : 'current';
}
