// src/lib/aurora/fetch-hpo-forecast.js
import fs from 'fs/promises';
import path from 'path';
import { CONFIG } from '../../config/app-config.js';

const UA = 'UmeaaAuroraHunters/1.0';

const cacheDir = (CONFIG.weather?.cache?.dir || 'cache');
const cacheTtlMin = Number(CONFIG.hpo?.cacheTtlMin || 30);
const hp60Cache = path.join(cacheDir, 'hpo_hp60.json');
const hp30Cache = path.join(cacheDir, 'hpo_hp30.json');

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }});
  if (!r.ok) throw new Error(`HPO fetch ${r.status} ${url}`);
  return r.json();
}

async function readFreshJson(cacheFile) {
  try {
    const st = await fs.stat(cacheFile);
    const ageMin = (Date.now() - st.mtimeMs) / 60000;
    if (ageMin < cacheTtlMin) return JSON.parse(await fs.readFile(cacheFile,'utf8'));
  } catch {}
  return null;
}

export async function fetchHp60Json() {
  const cached = await readFreshJson(hp60Cache);
  if (cached) return cached;
  const url = CONFIG.hpo?.urls?.hp60_json || process.env.HPO_HP60_JSON;
  if (!url) return null;
  const json = await fetchJson(url);
  await fs.mkdir(path.dirname(hp60Cache), { recursive: true });
  await fs.writeFile(hp60Cache, JSON.stringify(json));
  return json;
}

export async function fetchHp30Json() {
  const cached = await readFreshJson(hp30Cache);
  if (cached) return cached;
  const url = CONFIG.hpo?.urls?.hp30_json || process.env.HPO_HP30_JSON;
  if (!url) return null;
  const json = await fetchJson(url);
  await fs.mkdir(path.dirname(hp30Cache), { recursive: true });
  await fs.writeFile(hp30Cache, JSON.stringify(json));
  return json;
}

/* ---------------- Helpers (tål GFZ:s MEDIAN/MAX som objekt) ---------------- */

function toISO_UTC(t) {
  if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(t)) t += 'Z';
  const d = new Date(t);
  return isNaN(d) ? null : d.toISOString();
}

// Gör [{ timeISO, value }] från olika varianter:
// - { time:[...], value:[...] } / { datetime:[...], median:[...] } osv
// - [ [time, val], ... ] eller [ {time, value}, ... ]
// - { "YYYY-..sss": value, ... }  ← GFZ-fallet du har
function extractPairs(series) {
  const out = [];
  if (!series) return out;

  // 1) Nyckel→värde-objekt (GFZ)
  if (!Array.isArray(series) && typeof series === 'object') {
    const entries = Object.entries(series);
    // om det är “kolumn-objekt” (time/value-arrayer) hanteras strax nedan
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

  // 2) Kolumn-objekt (arrayer)
  if (typeof series === 'object' && !Array.isArray(series)) {
    const times = series.time || series.TIME || series.times || series.datetime || series.datetimes || series.t || series.x || series.X;
    const vals  = series.value || series.values || series.VALUE || series.VALUES || series.v || series.y || series.Y || series.median || series.MEDIAN;
    if (Array.isArray(times) && Array.isArray(vals) && times.length === vals.length) {
      for (let i=0;i<times.length;i++) {
        const iso = toISO_UTC(times[i]);
        const v = +vals[i];
        if (iso && Number.isFinite(v)) out.push({ timeISO: iso, value: v });
      }
      return out;
    }
  }

  // 3) Arrays
  if (Array.isArray(series)) {
    for (const el of series) {
      if (Array.isArray(el) && el.length >= 2) {
        const iso = toISO_UTC(el[0]);
        const v = +el[1];
        if (iso && Number.isFinite(v)) out.push({ timeISO: iso, value: v });
      } else if (typeof el === 'object' && el) {
        const iso = toISO_UTC(el.time ?? el.timestamp ?? el.datetime ?? el.t);
        const v = +(el.value ?? el.v ?? el.median ?? el.hp);
        if (iso && Number.isFinite(v)) out.push({ timeISO: iso, value: v });
      }
    }
  }
  return out;
}

function normalizeMedianMax(json) {
  const medPairs = extractPairs(json?.MEDIAN || json?.median);
  const maxPairs = extractPairs(json?.MAX || json?.max);
  const maxMap = new Map(maxPairs.map(p => [p.timeISO, p.value]));

  const rows = [];
  for (const p of medPairs) {
    const k = new Date(p.timeISO); k.setUTCMinutes(0,0,0);
    const hour_start = k.toISOString();
    rows.push({ hour_start, median: p.value, max: maxMap.get(p.timeISO) ?? null });
  }
  for (const p of maxPairs) {
    const k = new Date(p.timeISO); k.setUTCMinutes(0,0,0);
    const hour_start = k.toISOString();
    if (!rows.find(r => r.hour_start === hour_start)) {
      rows.push({ hour_start, median: null, max: p.value });
    }
  }
  rows.sort((a,b)=> new Date(a.hour_start) - new Date(b.hour_start));
  return rows;
}

/** → [{ hour_start, hp60_median, hp60_max }] */
export function normalizeHp60(json) {
  const out = [];
  if (json?.MEDIAN || json?.MAX || json?.median || json?.max) {
    const rows = normalizeMedianMax(json);
    for (const r of rows) out.push({ hour_start: r.hour_start, hp60_median: r.median, hp60_max: r.max });
    return out;
  }
  // fallback (äldre format)
  const rows = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : null);
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const t = r.time ?? r.timestamp ?? r.valid_time ?? r.hour_start ?? r.datetime;
      const iso = toISO_UTC(t); if (!iso) continue;
      const m = r.median ?? r.hp60_median ?? r.value ?? r.hp;
      const mx = r.max ?? r.hp60_max ?? r.max_value ?? r.hp_max;
      out.push({ hour_start: iso, hp60_median: Number.isFinite(+m)?+m:null, hp60_max: Number.isFinite(+mx)?+mx:null });
    }
  }
  out.sort((a,b)=> new Date(a.hour_start) - new Date(b.hour_start));
  return out;
}

/** → [{ hour_start, hp30_median, hp30_max }] */
export function normalizeHp30(json) {
  const out = [];
  if (json?.MEDIAN || json?.MAX || json?.median || json?.max) {
    const rows = normalizeMedianMax(json);
    for (const r of rows) out.push({ hour_start: r.hour_start, hp30_median: r.median, hp30_max: r.max });
    return out;
  }
  const rows = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : null);
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const t = r.time ?? r.timestamp ?? r.valid_time ?? r.hour_start ?? r.datetime;
      const iso = toISO_UTC(t); if (!iso) continue;
      const m = r.median ?? r.hp30_median ?? r.value ?? r.hp;
      const mx = r.max ?? r.hp30_max ?? r.max_value ?? r.hp_max;
      out.push({ hour_start: iso, hp30_median: Number.isFinite(+m)?+m:null, hp30_max: Number.isFinite(+mx)?+mx:null });
    }
  }
  out.sort((a,b)=> new Date(a.hour_start) - new Date(b.hour_start));
  return out;
}
