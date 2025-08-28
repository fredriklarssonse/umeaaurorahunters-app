// src/lib/astro/weather-range.js
import fs from 'fs/promises';
import path from 'path';
import { CONFIG } from '../../config/app-config.js';

const UA = CONFIG.weather?.sources?.metUserAgent || 'UmeaaAuroraHunters/1.0 (contact@example.com)';
const cacheDir = CONFIG.weather?.cache?.dir || 'cache';
const cacheTtlMin = Number(CONFIG.weather?.cache?.ttlMinutes || 30);

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const floorHourISO = (d) => { const x = new Date(d); x.setUTCMinutes(0,0,0); x.setUTCSeconds(0,0); return x.toISOString(); };
const addHours = (d,h) => new Date(new Date(d).getTime() + h*3600*1000);

function hoursBetween(startISO, endISO) {
  const out = [];
  for (let t = new Date(startISO); t < new Date(endISO); t = addHours(t,1)) {
    out.push(floorHourISO(t));
  }
  return out;
}

async function readFreshJson(file) {
  try {
    const st = await fs.stat(file);
    const ageMin = (Date.now() - st.mtimeMs)/60000;
    if (ageMin < cacheTtlMin) return JSON.parse(await fs.readFile(file,'utf8'));
  } catch(_) {}
  return null;
}
async function writeCache(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data));
}

/* ---------- Provider: MET Norway ---------- */
async function fetchMET(lat, lon) {
  const file = path.join(cacheDir, `weather/met_${lat.toFixed(3)}_${lon.toFixed(3)}.json`);
  const cached = await readFreshJson(file);
  if (cached) return cached;

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }});
  if (!r.ok) throw new Error(`MET ${r.status}`);
  const json = await r.json();
  await writeCache(file, json);
  return json;
}
function normalizeMET(json) {
  const out = new Map();
  const rows = json?.properties?.timeseries || [];
  for (const r of rows) {
    const t = floorHourISO(r.time);
    const inst = r.data?.instant?.details || {};
    let clouds = inst.cloud_area_fraction; // %
    if (!Number.isFinite(clouds)) {
      const lo = inst.cloud_area_fraction_low;
      const mi = inst.cloud_area_fraction_medium;
      const hi = inst.cloud_area_fraction_high;
      if ([lo,mi,hi].some(v => Number.isFinite(v))) {
        clouds = [lo,mi,hi].filter(Number.isFinite).reduce((a,b)=>a+b,0) / ([lo,mi,hi].filter(Number.isFinite).length || 1);
      }
    }
    if (Number.isFinite(clouds)) {
      out.set(t, { clouds: clamp(Math.round(clouds),0,100), cloud_thickness: null });
    }
  }
  return out;
}

/* ---------- Provider: SMHI ---------- */
async function fetchSMHI(lat, lon) {
  const file = path.join(cacheDir, `weather/smhi_${lat.toFixed(3)}_${lon.toFixed(3)}.json`);
  const cached = await readFreshJson(file);
  if (cached) return cached;

  const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon}/lat/${lat}/data.json`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }});
  if (!r.ok) throw new Error(`SMHI ${r.status}`);
  const json = await r.json();
  await writeCache(file, json);
  return json;
}
function normalizeSMHI(json) {
  // timeSeries[].parameters[]; tcc_mean (octas 0..8)
  const out = new Map();
  const rows = json?.timeSeries || [];
  for (const r of rows) {
    const t = floorHourISO(r.validTime);
    const param = r.parameters || [];
    const tcc = param.find(p => String(p.name).toLowerCase() === 'tcc_mean');
    if (!tcc) continue;
    const octas = Number(tcc.values?.[0]);
    if (!Number.isFinite(octas)) continue;
    const pct = clamp(Math.round((octas/8)*100), 0, 100);
    out.set(t, { clouds: pct, cloud_thickness: null });
  }
  return out;
}

/* ---------- Provider: Open-Meteo ---------- */
async function fetchOpenMeteo(lat, lon) {
  const file = path.join(cacheDir, `weather/openmeteo_${lat.toFixed(3)}_${lon.toFixed(3)}.json`);
  const cached = await readFreshJson(file);
  if (cached) return cached;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloudcover,cloudcover_low,cloudcover_mid,cloudcover_high&timezone=UTC`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }});
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const json = await r.json();
  await writeCache(file, json);
  return json;
}
function normalizeOpenMeteo(json) {
  const out = new Map();
  const h = json?.hourly || {};
  const times = h.time || [];
  const cover = h.cloudcover || [];
  for (let i=0;i<times.length;i++) {
    const t = floorHourISO(times[i]);
    const clouds = Number(cover[i]);
    if (Number.isFinite(clouds)) {
      out.set(t, { clouds: clamp(Math.round(clouds),0,100), cloud_thickness: null });
    }
  }
  return out;
}

/* ---------- Konsensus (viktsatt median) ---------- */
function weightedMedian(samples) {
  // samples: [{v, w}]
  const arr = samples.filter(s => Number.isFinite(s.v) && Number.isFinite(s.w) && s.w > 0)
                     .sort((a,b)=> a.v - b.v);
  const wsum = arr.reduce((a,s)=>a+s.w,0);
  if (!arr.length || wsum === 0) return null;
  let acc = 0;
  for (const s of arr) {
    acc += s.w;
    if (acc >= wsum/2) return s.v;
  }
  return arr[arr.length-1].v;
}

export async function getWeatherForRange(lat, lon, startISO, endISO, opts = {}) {
  // 1) Hämta alla källor (1 gång var, cacheade)
  const [metJ, smhiJ, omJ] = await Promise.allSettled([
    fetchMET(lat, lon),
    fetchSMHI(lat, lon),
    fetchOpenMeteo(lat, lon)
  ]);

  const metMap  = metJ.status  === 'fulfilled' ? normalizeMET(metJ.value)  : new Map();
  const smhiMap = smhiJ.status === 'fulfilled' ? normalizeSMHI(smhiJ.value) : new Map();
  const omMap   = omJ.status   === 'fulfilled' ? normalizeOpenMeteo(omJ.value) : new Map();

  const weights = CONFIG.weather?.consensus?.weights || { met: 0.5, smhi: 0.3, openmeteo: 0.2 };
  const disagree = CONFIG.weather?.consensus?.disagreementThreshold ?? 40;
  const lev = CONFIG.weather?.consensus?.levels || { medium: 25, high: 40 };

  // 2) Konsensus per timme i intervallet
  const hours = hoursBetween(startISO, endISO);
  const rows = [];

  for (const hIso of hours) {
    const met  = metMap.get(hIso)?.clouds;
    const smhi = smhiMap.get(hIso)?.clouds;
    const om   = omMap.get(hIso)?.clouds;

    const samples = [];
    if (Number.isFinite(met))  samples.push({ v: met,  w: weights.met  ?? 0.5 });
    if (Number.isFinite(smhi)) samples.push({ v: smhi, w: weights.smhi ?? 0.3 });
    if (Number.isFinite(om))   samples.push({ v: om,   w: weights.openmeteo ?? 0.2 });

    let clouds = null;
    if (samples.length) {
      const med = weightedMedian(samples);
      clouds = med != null ? Math.round(med) : null;
    }

    // oenighet
    const present = [met, smhi, om].filter(Number.isFinite);
    const span = present.length ? (Math.max(...present) - Math.min(...present)) : null;
    let disagreement_level = null;
    if (span != null) {
      if (span >= lev.high) disagreement_level = 'high';
      else if (span >= lev.medium) disagreement_level = 'medium';
      else disagreement_level = 'low';
    }

    rows.push({
      hour_start: hIso,
      clouds,                         // konsensus (%)
      cloud_thickness: null,          // reserverat (om du vill härleda senare)
      providers: {
        met: Number.isFinite(met) ? met : null,
        smhi: Number.isFinite(smhi) ? smhi : null,
        openmeteo: Number.isFinite(om) ? om : null
      },
      disagreement_span: span,        // %-enheter mellan min/max
      disagreement_level             // 'low'|'medium'|'high'
    });
  }

  return rows;
}
