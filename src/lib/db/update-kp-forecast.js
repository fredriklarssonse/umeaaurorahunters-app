// src/lib/db/update-kp-forecast.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
}
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const KP_URL = process.env.KP_HOURLY_JSON;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const toScore10 = (kp) => clamp((Number(kp) / 9) * 10, 0, 10);

const roundIsoHour = (d) => {
  const t = new Date(d);
  t.setUTCMinutes(0, 0, 0);
  return t.toISOString();
};

async function fetchJson(url) {
  if (!url) return null;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return r.json();
}

function parseGfzSeries(json) {
  if (!json || typeof json !== 'object') return { median: new Map(), max: new Map() };
  const med = json.MEDIAN || {};
  const mx  = json.MAX    || {};
  const median = new Map();
  const max    = new Map();
  for (const [k, v] of Object.entries(med)) {
    median.set(roundIsoHour(k), Number(v));
  }
  for (const [k, v] of Object.entries(mx)) {
    max.set(roundIsoHour(k), Number(v));
  }
  return { median, max };
}

async function upsertPotential(rows) {
  if (!rows.length) return { count: 0 };
  const { error } = await supa
    .from('aurora_potential_hourly')
    .upsert(rows, { onConflict: 'hour_start' }); // 1 rad/timme
  if (error) throw error;
  return { count: rows.length };
}

export async function updateKpForecastHourly() {
  const kpJson = await fetchJson(KP_URL);
  const kp = parseGfzSeries(kpJson);

  const hours = new Set([...kp.median.keys(), ...kp.max.keys()]);
  const rows = [];
  for (const hour of [...hours].sort()) {
    const kpVal = kp.median.get(hour) ?? kp.max.get(hour);
    if (kpVal == null) continue;
    rows.push({
      hour_start: hour,
      potential_score10: toScore10(kpVal),
      source: kp.median.has(hour) ? 'kp_median' : 'kp_max'
    });
  }

  const { count } = await upsertPotential(rows);
  console.log(`Saved ${count} rows to aurora_potential_hourly (kp)`);
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateKpForecastHourly().catch(e => {
    console.error('updateKpForecastHourly ERR:', e);
    process.exit(1);
  });
}
