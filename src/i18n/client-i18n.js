// Minimal i18n för klienten – hämtar JSON och formatterar med Intl.
// Användning:
//   import { initI18n, t, setLang, getLang } from '../i18n/client-i18n.js';
//   await initI18n();  document.querySelector('#lbl').textContent = t('ui.now');

let DICT = {};
let LANG = 'sv';

const numFmtCache = new Map();
function nf(opts) {
  const k = JSON.stringify([LANG, opts]);
  if (!numFmtCache.has(k)) numFmtCache.set(k, new Intl.NumberFormat(LANG, opts));
  return numFmtCache.get(k);
}

export function getLang() { return LANG; }

export async function initI18n(preferred) {
  const urlParam = new URLSearchParams(location.search).get('lang');
  const stored = localStorage.getItem('lang');
  LANG = (preferred || urlParam || stored || navigator.language || 'sv').slice(0,2);
  try {
    const resp = await fetch(`/locales/${LANG}.json`, { cache: 'no-store' });
    if (!resp.ok) throw new Error('fetch locale failed');
    DICT = await resp.json();
  } catch {
    if (LANG !== 'en') {
      LANG = 'en';
      const resp = await fetch(`/locales/en.json`, { cache: 'no-store' });
      DICT = await resp.json();
    }
  }
  document.documentElement.setAttribute('lang', LANG);
}

export function setLang(l) {
  LANG = l.slice(0,2);
  localStorage.setItem('lang', LANG);
  location.search = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), lang: LANG }).toString();
}

// Enkel lookup "a.b.c"
function lookup(key) {
  return key.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : undefined), DICT);
}

// Enkel ersättning av {param}
function interpolate(str, params = {}) {
  return str.replace(/\{(\w+)(?:,[^}]*)?\}/g, (_, k) => {
    const v = params[k];
    if (typeof v === 'number' && /::percent/.test(str)) return nf({ style: 'percent', maximumFractionDigits: 0 }).format(v);
    if (typeof v === 'number') return nf({ maximumFractionDigits: 1 }).format(v);
    return v ?? '';
  });
}

// t("breakdown.clouds", { clouds: 0.2, factor: 0.8 })
export function t(key, params) {
  const tmpl = lookup(key);
  if (typeof tmpl === 'string') return interpolate(tmpl, params);
  return key; // fallback
}

// Hjälpare för breakdown-poster: {code, params}[] -> strängar
export function renderBreakdown(items = []) {
  return items.map(it => {
    if (it.code) return t(it.code, it.params || {});
    // legacy fallback: om API:t skickar label: "Moln: 20%"
    if (it.label) return it.label;
    return '';
  }).filter(Boolean);
}
