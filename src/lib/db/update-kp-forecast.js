// src/lib/db/update-kp-forecast.js
import { CONFIG } from '../../config/app-config.js';
import { saveData } from './savedata.js';

const UA = 'UmeaaAuroraHunters/1.0';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const floorHourIso = (t) => { const d = new Date(t); d.setUTCMinutes(0,0,0); return d.toISOString(); };

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Kp fetch ${r.status} ${url}`);
  return r.json();
}

function toISO_UTC(t) {
  if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(t)) t += 'Z';
  const d = new Date(t);
  return isNaN(d) ? null : d.toISOString();
}

// Som i HPO: stöder objekt med tidsnycklar, kolumn-objekt och arrayer
function extractPairs(series) {
  const out = [];
  if (!series) return out;

  if (!Array.isArray(series) && typeof series === 'object') {
    const entries = Object.entries(series);
    const looksLikeKV = entries.every(([k,v]) => typeof k === 'string' && (typeof v === 'number' || (typeof v === 'string' && !isNaN(+v))));
    if (looksLikeKV) {
      for (const [k,v] of entries) {
        const iso = toISO_UTC(k);
        const num = +v;
        if (iso && Number.isFinite(num)) out.push({ timeISO: iso, value: num });
      }
      return out;
    }
  }

  if (typeof series === 'object' && !Array.isArray(series)) {
    const times = series.time || series.TIME || series.times || series.datetime || series.datetimes || series.t;
    const vals  = series.value || series.values || series.VALUE || series.VALUES || series.v || series.median || series.MEDIAN;
    if (Array.isArray(times) && Array.isArray(vals) && times.length === vals.length) {
      for (let i=0;i<times.length;i++) {
        const iso = toISO_UTC(times[i]);
        const v = +vals[i];
        if (iso && Number.isFinite(v)) out.push({ timeISO: iso, value: v });
      }
      return out;
    }
  }

  if (Array.isArray(series)) {
    for (const el of series) {
      if (Array.isArray(el) && el.length >= 2) {
        const iso = toISO_UTC(el[0]);
        const v = +el[1];
        if (iso && Number.isFinite(v)) out.push({ timeISO: iso, value: v });
      } else if (typeof el === 'object' && el) {
        const iso = toISO_UTC(el.time ?? el.timestamp ?? el.datetime);
        const v = +(el.value ?? el.v ?? el.median ?? el.Kp ?? el.kp);
        if (iso && Number.isFinite(v)) out.push({ timeISO: iso, value: v });
      }
    }
  }

  return out;
}

function normalizeKpJson(json) {
  const out = [];

  // A) GFZ MEDIAN som objekt
  if (json?.MEDIAN || json?.median) {
    const pairs = extractPairs(json.MEDIAN || json.median);
    for (const p of pairs) {
      const hour_start = floorHourIso(p.timeISO);
      out.push({ hour_start, kp_predicted: clamp(+p.value, 0, 9), source: 'GFZ mean_bars' });
    }
    out.sort((a,b)=> new Date(a.hour_start) - new Date(b.hour_start));
    return out;
  }

  // B) fallback-format
  const rows = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : null);
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const t = r.hour_start ?? r.time ?? r.timestamp ?? r.valid_time ?? r.start ?? r.datetime;
      const v = r.kp_predicted ?? r.kp ?? r.value ?? r.Kp ?? r.median;
      if (!t || v == null) continue;
      const hour_start = floorHourIso(toISO_UTC(t) || t);
      out.push({ hour_start, kp_predicted: clamp(+v, 0, 9), source: 'GFZ mean_bars' });
    }
  } else {
    const times = json?.time || json?.times || json?.datetime || json?.datetimes;
    const vals  = json?.median || json?.kp || json?.value || json?.Kp;
    if (Array.isArray(times) && Array.isArray(vals) && times.length === vals.length) {
      for (let i=0;i<times.length;i++) {
        const hour_start = floorHourIso(toISO_UTC(times[i]) || times[i]);
        const v = +vals[i];
        if (Number.isFinite(v)) out.push({ hour_start, kp_predicted: clamp(v, 0, 9), source: 'GFZ mean_bars' });
      }
    }
  }

  out.sort((a,b)=> new Date(a.hour_start) - new Date(b.hour_start));
  return out;
}

export async function updateKpForecastHourly() {
  const url = CONFIG.kp?.urls?.hourly_json || process.env.KP_HOURLY_JSON;
  if (!url) { console.warn('[Kp] No KP_HOURLY_JSON set'); return { rowsSaved: 0 }; }
  const json = await fetchJson(url);
  const rows = normalizeKpJson(json);
  if (rows.length) await saveData('kp_forecast_hourly', rows, ['hour_start']);
  else console.warn('[Kp] Nothing to save (0 rows)');
  return { rowsSaved: rows.length };
}
