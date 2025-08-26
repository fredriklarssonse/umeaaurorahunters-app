import fetch from 'node-fetch';
import { saveData } from '../db/savedata.js';

// ---------- utils ----------
const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const first = (obj, keys) => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return null;
};
const toRecordsFromMatrix = (matrix) => {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];
  const [header, ...rows] = matrix;
  return rows.map(r => {
    const o = {};
    header.forEach((h, i) => { o[String(h).trim()] = r[i]; });
    return o;
  });
};

async function getJson(url) {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// ---------- parsers för SWPC “products” ----------
async function fetchFromProducts(window = '2-hour') {
  // Se produktlistan här: /products/solar-wind/ (mag-*.json, plasma-*.json)
  // Varje fil är [ [headers...], [...row], ... ] och kan byta rymdfarkost automatiskt (RTSW).
  const magUrl = `https://services.swpc.noaa.gov/products/solar-wind/mag-${window}.json`;
  const plasmaUrl = `https://services.swpc.noaa.gov/products/solar-wind/plasma-${window}.json`;

  const [magJson, plasmaJson] = await Promise.all([getJson(magUrl), getJson(plasmaUrl)]);
  const magRows = toRecordsFromMatrix(magJson);
  const plasmaRows = toRecordsFromMatrix(plasmaJson);

  // indexera plasma på timestamp
  const keyNames = ['time_tag', 'time', 'timestamp', 'date'];
  const plasmaByTime = new Map(plasmaRows.map(p => {
    const t = first(p, keyNames);
    return [t, p];
  }));

  const batch = [];
  for (const m of magRows) {
    const t = first(m, keyNames);
    if (!t) continue;
    const p = plasmaByTime.get(t);
    if (!p) continue;

    const row = {
      time_tag: t, // ISO UTC i SWPC-products
      // magnetometer (namn kan variera mellan produkter – vi plockar första som finns)
      bx: num(first(m, ['bx_gsm','bx','Bx','bx (nT)'])),
      by: num(first(m, ['by_gsm','by','By','by (nT)'])),
      bz: num(first(m, ['bz_gsm','bz','Bz','bz (nT)'])),
      bt: num(first(m, ['bt','Btotal','btotal','Bt','bt (nT)'])),
      // plasma (Faraday cup)
      speed:   num(first(p, ['speed','flow_speed','V','speed (km/s)'])),
      density: num(first(p, ['density','proton_density','Np','density (1/cm^3)'])),
      suspect_data: false,
      source_api: `SWPC products (${window})`
    };

    const bad =
      (row.speed   != null && (row.speed < 100 || row.speed > 2000)) ||
      (row.density != null && (row.density < 0   || row.density > 60)) ||
      (row.bt      != null && Math.abs(row.bt) > 100) ||
      (row.bz      != null && Math.abs(row.bz) > 100);

    if (bad) row.suspect_data = true;

    batch.push(row);
  }

  // sortera på tid (säkerhets skull)
  batch.sort((a,b) => new Date(a.time_tag) - new Date(b.time_tag));
  return batch;
}

// ---------- fallback till klassiska ACE-JSON ----------
async function fetchFromAce1h() {
  const [mag, swepam] = await Promise.all([
    getJson('https://services.swpc.noaa.gov/json/ace/mag/ace_mag_1h.json'),
    getJson('https://services.swpc.noaa.gov/json/ace/swepam/ace_swepam_1h.json')
  ]);

  const plasmaByTime = new Map(swepam.map(d => [d.time_tag, d]));
  const batch = [];

  for (const m of mag) {
    const s = plasmaByTime.get(m.time_tag);
    if (!s) continue;

    const row = {
      time_tag: m.time_tag,
      bx: num(m.bx_gsm ?? m.bx),
      by: num(m.by_gsm ?? m.by),
      bz: num(m.bz_gsm ?? m.bz),
      bt: num(m.bt ?? m.btotal ?? m.b),
      speed: num(s.speed),
      density: num(s.density),
      suspect_data: false,
      source_api: 'ACE 1h'
    };

    const bad =
      (row.speed   != null && (row.speed < 100 || row.speed > 2000)) ||
      (row.density != null && (row.density < 0   || row.density > 60)) ||
      (row.bt      != null && Math.abs(row.bt) > 100) ||
      (row.bz      != null && Math.abs(row.bz) > 100);

    if (bad) row.suspect_data = true;

    batch.push(row);
  }

  batch.sort((a,b) => new Date(a.time_tag) - new Date(b.time_tag));
  return batch;
}

// ---------- huvudfunktion ----------
export async function fetchSolarWindHistory() {
  const attempts = [
    async () => fetchFromProducts('2-hour'),
    async () => fetchFromProducts('1-day'),
    async () => fetchFromAce1h()
  ];

  for (const tryFn of attempts) {
    try {
      const batch = await tryFn();
      if (Array.isArray(batch) && batch.length) {
        await saveData('aurora_solar_wind', batch, ['time_tag']); // PK finns på time_tag
        return batch;
      }
    } catch (e) {
      // prova nästa källa
      console.warn('[solar-wind] source failed:', e.message);
    }
  }

  console.error('All solar-wind sources failed or returned empty.');
  return [];
}
