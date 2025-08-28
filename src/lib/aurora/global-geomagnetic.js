// src/lib/aurora/global-geomagnetic.js
import { saveData } from '../db/savedata.js';
import { fetchSolarWindHistory } from './fetch-solar-wind.js';
import { calculateGeomagneticScoreDetailed } from './calculate-geomagnetic-score.js';
import { getAuxIndicesNow, blendWithAux } from './aux-indices.js';
import { CONFIG } from '../../config/app-config.js';
import { fetchHp60Json, normalizeHp60 } from './fetch-hpo-forecast.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const nowIso = () => new Date().toISOString();

/* ---------------- DB helper (med <=now och fallback >=now) ---------------- */
async function getLatestHourlyRow(table) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return null;

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  // #1 senast <= nu
  let url = `${base}/rest/v1/${table}`
          + `?select=*`
          + `&hour_start=lte.${encodeURIComponent(new Date().toISOString())}`
          + `&order=hour_start.desc&limit=1`;
  let r = await fetch(url, { headers });
  if (r.ok) {
    const j = await r.json();
    if (Array.isArray(j) && j.length) return j[0];
  }

  // #2 tidigast >= nu
  url = `${base}/rest/v1/${table}`
      + `?select=*`
      + `&hour_start=gte.${encodeURIComponent(new Date().toISOString())}`
      + `&order=hour_start.asc&limit=1`;
  r = await fetch(url, { headers });
  if (!r.ok) return null;
  const j2 = await r.json();
  return (Array.isArray(j2) && j2.length) ? j2[0] : null;
}

/* ---------------- Lokala helpers ---------------- */
function pickBestHour(rows, now = new Date()) {
  if (!Array.isArray(rows) || !rows.length) return null;
  // föredra senaste <= now; annars första framtida
  let bestPast = null, bestPastT = -Infinity;
  let bestFuture = null, bestFutureT = Infinity;
  for (const r of rows) {
    const t = new Date(r.hour_start).getTime();
    if (Number.isNaN(t)) continue;
    if (t <= now.getTime()) {
      if (t > bestPastT) { bestPastT = t; bestPast = r; }
    } else {
      if (t < bestFutureT) { bestFutureT = t; bestFuture = r; }
    }
  }
  return bestPast || bestFuture || null;
}

/* ---------------- Fallback: hämta Kp från GFZ direkt ---------------- */
async function fetchKpJson() {
  const url = CONFIG.kp?.urls?.hourly_json || process.env.KP_HOURLY_JSON;
  if (!url) return null;
  const r = await fetch(url, { headers: { 'User-Agent': 'UmeaaAuroraHunters/1.0', 'Accept': 'application/json' }});
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}
function toISO_UTC(t) {
  if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(t)) t += 'Z';
  const d = new Date(t); return isNaN(d) ? null : d.toISOString();
}
function extractPairs(series) {
  const out = [];
  if (!series) return out;
  if (!Array.isArray(series) && typeof series === 'object') {
    const entries = Object.entries(series);
    const looksKV = entries.every(([k,v]) => typeof k === 'string' && (typeof v === 'number' || (typeof v === 'string' && !isNaN(+v))));
    if (looksKV) {
      for (const [k,v] of entries) {
        const iso = toISO_UTC(k); const num = +v;
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
        const iso = toISO_UTC(times[i]), v = +vals[i];
        if (iso && Number.isFinite(v)) out.push({ timeISO: iso, value: v });
      }
      return out;
    }
  }
  if (Array.isArray(series)) {
    for (const el of series) {
      if (Array.isArray(el) && el.length >= 2) {
        const iso = toISO_UTC(el[0]), v = +el[1];
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
function normalizeKpFromJson(json) {
  if (!json) return [];
  const pairs = extractPairs(json.MEDIAN || json.median || json);
  return pairs.map(p => ({ hour_start: p.timeISO, kp_predicted: clamp(+p.value, 0, 9) }))
              .sort((a,b)=> new Date(a.hour_start) - new Date(b.hour_start));
}

/* ---------------- Hämta HPO/Kp – DB först, annars fetch ---------------- */
async function getHpoHour() {
  // 1) DB
  const dbRow = await getLatestHourlyRow('aurora_hpo_forecast_hourly');
  if (dbRow?.hour_start) return dbRow;

  // 2) Fallback: fetch Hp60 och normalisera
  try {
    const j60 = await fetchHp60Json();
    const r60 = j60 ? normalizeHp60(j60) : [];
    return pickBestHour(r60);
  } catch { return null; }
}

async function getKpHour() {
  // 1) DB
  const dbRow = await getLatestHourlyRow('kp_forecast_hourly');
  if (dbRow?.hour_start) return dbRow;

  // 2) Fallback: fetch Kp JSON
  try {
    const jk = await fetchKpJson();
    const rk = normalizeKpFromJson(jk);
    return pickBestHour(rk);
  } catch { return null; }
}

/* ---------------- Huvudfunktion ---------------- */
let memo = null;

export async function getGlobalGeomagneticNow() {
  if (memo) return memo;

  // ---------- BASKÄLLOR ----------
  const hpo = await getHpoHour();     // { hour_start, hp60_median, ... } eller null
  const kp  = await getKpHour();      // { hour_start, kp_predicted }     eller null

  // Solarwind-heuristik
  let swDetail = null, swScore10 = null, swTime = null;
  try {
    const history = await fetchSolarWindHistory();
    if (history?.length) {
      const geo = calculateGeomagneticScoreDetailed(history, { windowSize: CONFIG.geomagnetic?.windowSize || 6 });
      swDetail = geo;
      swScore10 = clamp(geo.score, 0, 10);
      const latest = history.filter(d => !d.suspect_data).slice(-1)[0] || history[history.length - 1];
      swTime = latest?.time_tag || nowIso();
    }
  } catch {}

  const blend = CONFIG.geomagnetic?.blend || { w_hpo: 0.55, w_kp: 0.15, w_sw: 0.10, w_hemi: 0.12, w_ae: 0.06, w_dst: 0.02 };

  const baseParts = [];
  const baseScore = {};

  if (hpo?.hp60_median != null && isFinite(hpo.hp60_median)) {
    // GFZ Hp60 MEDIAN är Kp-lik skala (0..~9+). Skalar till 0..10.
    const kp_equiv_hpo = clamp(Number(hpo.hp60_median), 0, 12);
    const score10_hpo  = clamp((kp_equiv_hpo / 9) * 10, 0, 10);
    baseParts.push({ kind: 'hpo', kp_equiv: kp_equiv_hpo, score10: score10_hpo, w: blend.w_hpo, time: hpo.hour_start });
    baseScore.hpo = score10_hpo;
  }

  if (kp?.kp_predicted != null && isFinite(kp.kp_predicted)) {
    const kp_equiv_kp = clamp(Number(kp.kp_predicted), 0, 9);
    const score10_kp  = clamp((kp_equiv_kp / 9) * 10, 0, 10);
    baseParts.push({ kind: 'kp', kp_equiv: kp_equiv_kp, score10: score10_kp, w: blend.w_kp, time: kp.hour_start });
    baseScore.kp = score10_kp;
  }

  if (swScore10 != null) {
    const kp_equiv_sw = clamp(swScore10 * 0.9, 0, 9); // grov prox
    baseParts.push({ kind: 'solarwind', kp_equiv: kp_equiv_sw, score10: swScore10, w: blend.w_sw, time: swTime || nowIso(), detail: swDetail });
    baseScore.sw = swScore10;
  }

  if (!baseParts.length) return null;

  // Normalisera vikter bland de som finns
  const W = baseParts.reduce((a,p)=> a + (isFinite(p.w) ? p.w : 0), 0) || 1;
  for (const p of baseParts) p.wn = (isFinite(p.w) ? p.w : 0) / W;

  // Kp-proxy (ENDAST bas-källor)
  const kp_comb   = baseParts.reduce((a,p)=> a + (p.kp_equiv * p.wn), 0);
  const baseScore10 = baseParts.reduce((a,p)=> a + (p.score10 * p.wn), 0);

  // ---------- AUX-INDEX ----------
  const aux = await getAuxIndicesNow();
  const global_score = blendWithAux(
    { hpo: baseScore.hpo ?? null, kp: baseScore.kp ?? null, sw: baseScore.sw ?? null },
    blend,
    aux
  );

  // Tidsstämpel = senast använd tid
  const times = [
    ...baseParts.map(p => p.time).filter(Boolean),
    aux?.raw?.hemi_power_time,
    aux?.raw?.ae_time,
    aux?.raw?.dst_time
  ].filter(Boolean);
  const chosenTime = times.length ? Math.max(...times.map(t => new Date(t).getTime())) : Date.now();
  const time_tag = new Date(chosenTime).toISOString();

  // Stale-status
  const ageH = (Date.now() - new Date(time_tag).getTime()) / 36e5;
  const th = CONFIG.solarWind?.staleHoursLevels || { fresh: 1, slight: 3, stale: 12 };
  const stale_status =
    ageH <= th.fresh  ? 'fresh' :
    ageH <= th.slight ? 'slightly-stale' :
    ageH <= th.stale  ? 'stale' : 'very-stale';

  const row = {
    time_tag,
    global_score: clamp(global_score ?? baseScore10, 0, 10),
    kp_proxy: clamp(kp_comb, 0, 9),
    stale_hours: ageH,
    stale_status,
    // Aux-raw
    hemi_power_gw: aux?.raw?.hemi_power_gw ?? null,
    ae_quicklook:  aux?.raw?.ae_quicklook ?? null,
    dst_quicklook: aux?.raw?.dst_quicklook ?? null,
    hemi_power_time: aux?.raw?.hemi_power_time ?? null,
    ae_time: aux?.raw?.ae_time ?? null,
    dst_time: aux?.raw?.dst_time ?? null,
    // Diagnos
    detail: {
      source: 'blend(base+aux)',
      baseParts: baseParts.map(p => ({ kind: p.kind, kp_equiv: p.kp_equiv, score10: p.score10, w: p.wn, time: p.time })),
      auxParts: {
        score_hemi: aux?.score_hemi ?? null,
        score_ae:   aux?.score_ae ?? null,
        score_dst:  aux?.score_dst ?? null
      }
    }
  };

  await saveData('aurora_geomagnetic_now', [row], ['time_tag']);
  memo = row;
  return row;
}
