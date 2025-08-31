// src/lib/i18n/i18n.js

// plocka "a.b.c" ur dict
function getFromDict(dict, path, fallback = '') {
  const parts = path.split('.');
  let cur = dict;
  for (const k of parts) {
    if (cur && typeof cur === 'object' && k in cur) {
      cur = cur[k];
    } else {
      return fallback;
    }
  }
  return typeof cur === 'string' ? cur : (cur != null ? String(cur) : fallback);
}

// ersätt {nyckel} i strängen
function formatTemplate(str, params = {}) {
  return str.replace(/\{(\w+)\}/g, (m, k) =>
    params[k] === 0 || params[k] ? String(params[k]) : m
  );
}

// skapa t() och formaterare för givet språk + dict
export function makeI18n(lang, dict) {
  const t = (key, params) => {
    const raw = getFromDict(dict, key, key);
    return formatTemplate(raw, params);
  };

  // formatterare (håll dem enkla/snabba)
  const nf = new Intl.NumberFormat(lang);
  const pf0 = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 });
  const pf1 = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 });
  const tf_hm = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
  const df_short = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });

  const fmt = {
    number: (x) => nf.format(x),
    percent0: (x) => pf0.format(x),
    percent1: (x) => pf1.format(x),
    timeHM: (d) => tf_hm.format(d instanceof Date ? d : new Date(d)),
    dateTimeShort: (d) => df_short.format(d instanceof Date ? d : new Date(d))
  };

  return { t, fmt, dict, lang };
}

// (frivillig) snabb hjälpfunktion för breakdown
export function renderBreakdown(items, t, dict) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const p = { ...(it.params || {}) };
    // mappa kategori-kod → label från dict
    if (p.category && dict?.light?.[p.category]) {
      p.categoryLabel = dict.light[p.category];
    }
    // stöd alias/normalisering om det behövs
    if (p.clouds != null && p.cloudsPct == null) {
      // om clouds angavs i % 0..100, låt det vara; annars skala
      p.cloudsPct = typeof p.clouds === 'number' && p.clouds <= 1 ? Math.round(p.clouds * 100) : p.clouds;
    }
    if (p.illum != null && p.illumPct == null) {
      p.illumPct = Math.round(p.illum * 100);
    }
    return t(it.code, p);
  });
}
