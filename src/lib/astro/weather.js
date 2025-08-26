// src/lib/astro/weather.js
// Node 18+: global fetch. På äldre Node, lägg: import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { CONFIG } from '../../config/app-config.js';

const CACHE_DIR = CONFIG.weather.cache.dir;
const CACHE_TTL_MS = CONFIG.weather.cache.ttlMinutes * 60 * 1000;

// --- utils ---
async function ensureDir(p) { try { await fs.mkdir(p, { recursive: true }); } catch {} }
const round3 = (x) => Math.round(x * 1000) / 1000;
const hourKey = (iso) => {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0)).toISOString();
};
const isNum = (x) => Number.isFinite(Number(x));
const jfetch = async (url, opts={}) => {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache', ...(opts.headers||{}) } });
  if (!res.ok) {
    const err = new Error(`${url} -> ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

// --- cache på aggregerad multi-source ---
function cachePath(lat, lon) {
  return path.join(CACHE_DIR, `weather-multi-${round3(lat)}_${round3(lon)}.json`);
}
async function readCache(lat, lon) {
  try {
    const txt = await fs.readFile(cachePath(lat, lon), 'utf-8');
    const j = JSON.parse(txt);
    if (Date.now() - new Date(j._fetchedAt).getTime() < CACHE_TTL_MS) return j.data;
  } catch {}
  return null;
}
async function writeCache(lat, lon, data) {
  await ensureDir(CACHE_DIR);
  await fs.writeFile(cachePath(lat, lon), JSON.stringify({ _fetchedAt: new Date().toISOString(), data }), 'utf-8');
}

// --- KÄLLA 1: MET Norway ---
async function fetchHourlyMET(lat, lon) {
  const ua = CONFIG.weather.sources.metUserAgent;
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const json = await jfetch(url, { headers: { 'User-Agent': ua } });
  const ts = json?.properties?.timeseries || [];
  return ts.map(row => {
    const time = row?.time;
    const details = row?.data?.instant?.details || {};
    let clouds = Number(details.cloud_area_fraction);
    if (!isNum(clouds)) {
      const parts = ['cloud_area_fraction_low', 'cloud_area_fraction_medium', 'cloud_area_fraction_high']
        .map(k => Number(details[k])).filter(isNum);
      clouds = parts.length ? Math.max(0, Math.min(100, Math.round(parts.reduce((a,b)=>a+b,0)))) : null;
    }
    return { dt: hourKey(time), clouds };
  });
}

// --- KÄLLA 2: SMHI PMP ---
async function fetchHourlySMHI(lat, lon) {
  const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon}/lat/${lat}/data.json`;
  const json = await jfetch(url);
  const series = json?.timeSeries || [];
  return series.map(s => {
    const time = s.validTime;
    const params = s.parameters || [];
    const get = (name) => params.find(p => (p.name || '').toLowerCase() === name)?.values?.[0];
    let clouds = get('tcc_mean') ?? get('tcc');
    if (!isNum(clouds)) {
      const lcc = get('lcc_mean'), mcc = get('mcc_mean'), hcc = get('hcc_mean');
      const parts = [lcc, mcc, hcc].map(Number).filter(isNum);
      clouds = parts.length ? Math.max(0, Math.min(100, Math.round(parts.reduce((a,b)=>a+b,0)))) : null;
    }
    return { dt: hourKey(time), clouds: isNum(clouds) ? Number(clouds) : null };
  });
}

// --- KÄLLA 3: Open-Meteo ---
async function fetchHourlyOpenMeteo(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover&forecast_days=2&timezone=UTC`;
  const j = await jfetch(url);
  const times = j?.hourly?.time || [];
  const cover = j?.hourly?.cloudcover || [];
  return times.map((t, i) => ({
    dt: hourKey(t),
    clouds: isNum(cover[i]) ? Number(cover[i]) : null
  }));
}

// --- median & viktad median ---
function plainMedian(arr) {
  const v = arr.filter(isNum).sort((a,b)=>a-b);
  if (!v.length) return null;
  const i = Math.floor(v.length/2);
  return v.length % 2 ? v[i] : (v[i-1] + v[i]) / 2;
}

function weightedMedian(vals, weights) {
  // filtrera null, normalisera vikter
  const entries = vals
    .map((v, i) => ({ v, w: weights[i] }))
    .filter(e => isNum(e.v) && isNum(e.w) && e.w > 0)
    .sort((a,b) => a.v - b.v);

  if (!entries.length) return null;
  const total = entries.reduce((s,e)=>s+e.w,0);
  let acc = 0;
  for (const e of entries) {
    acc += e.w;
    if (acc >= total/2) return e.v;
  }
  return entries[entries.length-1].v;
}

function consensusValue(valuesBySource, weights) {
  const names = Object.keys(valuesBySource);
  const vals = names.map(n => valuesBySource[n]);
  const wts  = names.map(n => weights[n] ?? 0);

  const have = vals.filter(isNum).length;
  if (have === 0) return { consensus: null, method: 'none' };
  if (have === 1) return { consensus: vals.find(isNum), method: 'single' };

  const consensus =
    CONFIG.weather.consensus.method === 'weighted-median'
      ? weightedMedian(vals, wts)
      : plainMedian(vals);

  return { consensus, method: CONFIG.weather.consensus.method };
}

// --- aggregering ---
function mergeSources(rowsBySource) {
  const map = new Map(); // dt -> { met, smhi, openmeteo }
  for (const [name, rows] of Object.entries(rowsBySource)) {
    for (const r of rows || []) {
      if (!r?.dt) continue;
      const slot = map.get(r.dt) || {};
      slot[name] = isNum(r.clouds) ? Number(r.clouds) : null;
      map.set(r.dt, slot);
    }
  }

  const out = [];
  const W = CONFIG.weather.consensus.weights;
  const thr = CONFIG.weather.consensus.disagreementThreshold;
  const levels = CONFIG.weather.consensus.levels;

  for (const [dt, values] of map.entries()) {
    const { consensus, method } = consensusValue(values, W);
    const present = Object.entries(values).filter(([,v]) => isNum(v));
    const arr = present.map(([,v]) => Number(v));

    const min = arr.length ? Math.min(...arr) : null;
    const max = arr.length ? Math.max(...arr) : null;
    const spread = (min != null && max != null) ? (max - min) : null;
    const disagree = spread != null ? spread >= thr : false;

    // outlier = källa med största avvikelse mot konsensus
    let outlier_source = null, outlier_diff = null;
    if (isNum(consensus) && present.length >= 2) {
      let best = -1;
      for (const [name, v] of present) {
        const d = Math.abs(v - consensus);
        if (d > best) { best = d; outlier_source = name; outlier_diff = d; }
      }
    }

    // enkel nivå-signal (low/med/high)
    let disagree_level = null;
    if (spread != null) {
      if (spread >= levels.high) disagree_level = 'high';
      else if (spread >= levels.medium) disagree_level = 'medium';
      else disagree_level = 'low';
    }

    const clouds = isNum(consensus) ? Number(consensus) : null;
    const cloud_thickness = clouds != null ? Math.max(0, Math.min(1, clouds/100)) : null;

    out.push({
      dt,
      clouds,
      cloud_thickness,
      consensus_method: method,
      sources: values,           // { met: 75, smhi: 60, openmeteo: 90 }
      disagree,
      disagree_level,
      spread,                    // %-enheter
      outlier_source,            // 'met' | 'smhi' | 'openmeteo'
      outlier_diff               // avvikelse i %-enheter
    });
  }

  out.sort((a,b) => new Date(a.dt) - new Date(b.dt));
  return out;
}

/**
 * Multi-source hourly (MET + SMHI + Open-Meteo), med konsensus (viktad median),
 * disagreement/outlier-flaggor och cache (30 min default).
 */
export async function getWeatherHourly(lat, lon) {
  // Cache
  const cached = await readCache(lat, lon);
  if (cached?.hourly?.length) return cached.hourly;

  const results = { met: [], smhi: [], openmeteo: [] };

  await Promise.allSettled([
    (async () => { try { results.met = await fetchHourlyMET(lat, lon); } catch (e) { console.warn('[MET] fail:', e.message); } })(),
    (async () => { try { results.smhi = await fetchHourlySMHI(lat, lon); } catch (e) { console.warn('[SMHI] fail:', e.message); } })(),
    (async () => { try { results.openmeteo = await fetchHourlyOpenMeteo(lat, lon); } catch (e) { console.warn('[Open-Meteo] fail:', e.message); } })(),
  ]);

  if (!(results.met.length || results.smhi.length || results.openmeteo.length)) return [];

  const hourly = mergeSources(results);
  await writeCache(lat, lon, { hourly });
  return hourly;
}

/**
 * “Nuvarande” väder – från multi-source hourly (närmsta timme ≥ nu; annars sista).
 * Retur innehåller även sources/disagree/outlier.
 */
export async function getWeatherData(lat, lon) {
  const hourly = await getWeatherHourly(lat, lon);
  if (!hourly?.length) return { clouds: null, cloud_thickness: null };
  const now = Date.now();
  const pick = hourly.find(h => new Date(h.dt).getTime() >= now) || hourly[hourly.length - 1];

  return {
    clouds: pick.clouds,
    cloud_thickness: pick.cloud_thickness,
    sources: pick.sources,
    disagree: pick.disagree,
    disagree_level: pick.disagree_level,
    spread: pick.spread,
    outlier_source: pick.outlier_source,
    outlier_diff: pick.outlier_diff,
    consensus_method: pick.consensus_method
  };
}
