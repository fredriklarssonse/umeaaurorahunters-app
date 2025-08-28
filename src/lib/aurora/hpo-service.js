// src/lib/aurora/hpo-service.js
import { CONFIG } from '../../config/app-config.js';

const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const HDRS = key ? { apikey: key, Authorization: `Bearer ${key}` } : null;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const floorHourISO = (d) => { const x = new Date(d); x.setUTCMinutes(0,0,0); return x.toISOString(); };
const addHours = (d,h) => new Date(new Date(d).getTime() + h*3600*1000);

async function pgFetch(table, select, startISO, endISO) {
  if (!base || !HDRS) return [];
  const url = `${base}/rest/v1/${table}`
    + `?select=${encodeURIComponent(select)}`
    + `&hour_start=gte.${encodeURIComponent(startISO)}`
    + `&hour_start=lt.${encodeURIComponent(endISO)}`
    + `&order=hour_start.asc`;
  const r = await fetch(url, { headers: HDRS });
  if (!r.ok) return [];
  return r.json();
}

/**
 * Hämtar HPO (Hp60) + Kp för ett intervall, blandar per timme enligt CONFIG.geomagnetic.blend
 * och returnerar en timserie:
 *   [{ hour_start, kp_equiv, score10, used: ['hpo','kp'], hp60_median, kp_predicted }]
 */
export async function getHpForRange(startISO, endISO, opts = {}) {
  const blend = (CONFIG.geomagnetic?.blend) || { w_hpo: 0.7, w_kp: 0.3 };
  const [hpoRows, kpRows] = await Promise.all([
    pgFetch('aurora_hpo_forecast_hourly', 'hour_start,hp60_median,hp60_max', startISO, endISO),
    pgFetch('kp_forecast_hourly',        'hour_start,kp_predicted',         startISO, endISO)
  ]);

  const hpoMap = new Map((hpoRows || []).map(r => [new Date(r.hour_start).toISOString(), r]));
  const kpMap  = new Map((kpRows  || []).map(r => [new Date(r.hour_start).toISOString(), r]));

  const rows = [];
  for (let t = new Date(startISO); t < new Date(endISO); t = addHours(t, 1)) {
    const key = floorHourISO(t);
    const hpo = hpoMap.get(key);
    const kp  = kpMap.get(key);

    const parts = [];
    if (hpo?.hp60_median != null && isFinite(hpo.hp60_median)) {
      const kp_equiv = clamp(Number(hpo.hp60_median), 0, 12);      // Hp är “open”; klipp mjukt
      const score10  = clamp((kp_equiv / 9) * 10, 0, 10);
      parts.push({ kind: 'hpo', kp_equiv, score10, w: blend.w_hpo ?? 0.7 });
    }
    if (kp?.kp_predicted != null && isFinite(kp.kp_predicted)) {
      const kp_equiv = clamp(Number(kp.kp_predicted), 0, 9);
      const score10  = clamp((kp_equiv / 9) * 10, 0, 10);
      parts.push({ kind: 'kp', kp_equiv, score10, w: blend.w_kp ?? 0.3 });
    }

    let result = { hour_start: key, kp_equiv: null, score10: null, used: [], hp60_median: null, kp_predicted: null };
    if (hpo) result.hp60_median = hpo.hp60_median;
    if (kp)  result.kp_predicted = kp.kp_predicted;

    if (parts.length) {
      const wsum = parts.reduce((a,p)=>a + (isFinite(p.w) ? p.w : 0), 0) || 1;
      const kp_equiv = parts.reduce((a,p)=>a + p.kp_equiv * ((isFinite(p.w)?p.w:0)/wsum), 0);
      result.kp_equiv = kp_equiv;
      result.score10  = clamp((kp_equiv / 9) * 10, 0, 10);
      result.used     = parts.map(p => p.kind);
    }

    rows.push(result);
  }

  return rows;
}
