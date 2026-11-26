// core/theme.js — Light / Dark / System. A device preference (not financial data), kept in localStorage.
// index.html applies the saved choice before first paint so there is no flash.

const KEY = 'soexpens-theme';
export const THEMES = ['system', 'light', 'dark'];
const BAR = { light: '#0a6b5b', dark: '#1e2226' }; // browser/status-bar colour per theme

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : 'system';
  } catch (e) { return 'system'; }
}

function effective(choice) {
  if (choice === 'light' || choice === 'dark') return choice;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(choice = getTheme()) {
  const root = document.documentElement;
  if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);
  else root.removeAttribute('data-theme');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BAR[effective(choice)]);
}

export function setTheme(choice) {
  if (!THEMES.includes(choice)) throw new Error('bad_theme');
  try { localStorage.setItem(KEY, choice); } catch (e) { /* still applies for this session */ }
  applyTheme(choice);
}

// When the phone flips between light and dark while "System" is chosen.
export function watchSystemTheme() {
  if (typeof matchMedia !== 'function') return;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getTheme() === 'system') applyTheme('system'); });
}
