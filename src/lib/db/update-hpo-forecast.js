// src/lib/db/update-hpo-forecast.js
import { createClient } from '@supabase/supabase-js';

// ======= Supabase client (service key krävs för upsert) =======
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env');
}
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ======= Källor (GFZ JSON) =======
const HP60_URL = process.env.HPO_HP60_JSON;   // ex: ...hpo_forecast_mean_bars_Hp60.json
const HP30_URL = process.env.HPO_HP30_JSON;   // ex: ...hpo_forecast_mean_bars_Hp30.json
const KP_URL   = process.env.KP_HOURLY_JSON;  // ex: ...hpo_forecast_mean_bars_Kp.json (valfritt)

// ======= Helpers =======
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
// Kp 0..9 -> score 0..10
const toScore10 = (kp) => clamp((Number(kp) / 9) * 10, 0, 10);

const roundIsoHour = (d) => {
  const t = new Date(d);
  t.setUTCMinutes(0, 0, 0);
  return t.toISOString(); // "YYYY-MM-DDTHH:00:00.000Z"
};

async function fetchJson(url) {
  if (!url) return null;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return r.json();
}

// Parse GFZ-format: { MEDIAN: { 'ISO': val, ... }, MAX: { ... } }
function parseGfzSeries(json) {
  if (!json || typeof json !== 'object') return { median: new Map(), max: new Map() };
  const med = json.MEDIAN || {};
  const mx  = json.MAX    || {};
  const median = new Map();
  const max    = new Map();
  for (const [k, v] of Object.entries(med)) {
    const iso = roundIsoHour(k);
    median.set(iso, Number(v));
  }
  for (const [k, v] of Object.entries(mx)) {
    const iso = roundIsoHour(k);
    max.set(iso, Number(v));
  }
  return { median, max };
}

// Upsert batch till en tabell med onConflict=hour_start
async function upsertPotential(rows) {
  if (!rows.length) return { count: 0 };
  const { error } = await supa
    .from('aurora_potential_hourly')
    .upsert(rows, { onConflict: 'hour_start' }); // 1 rad/timme
  if (error) throw error;
  return { count: rows.length };
}

// ======= Main =======
export async function updateHpoForecastHourly() {
  // 1) Hämta källor
  const [hp60Json, hp30Json, kpJson] = await Promise.all([
    fetchJson(HP60_URL).catch(() => null),
    fetchJson(HP30_URL).catch(() => null),
    fetchJson(KP_URL).catch(() => null),
  ]);

  // 2) Plocka serier
  const hp60 = parseGfzSeries(hp60Json); // Kp-ekv redan i GFZ-Kp-filen, Hp60-filen är i Hp – använd median/MAX nedan om du vill bygga mer avancerat
  const hp30 = parseGfzSeries(hp30Json);
  const kp   = parseGfzSeries(kpJson);

  // 3) Union av alla timmar vi har
  const hours = new Set([
    ...hp60.median.keys(), ...hp60.max.keys(),
    ...hp30.median.keys(), ...hp30.max.keys(),
    ...kp.median.keys(),   ...kp.max.keys(),
  ]);

  // 4) För varje timme: välj bästa kp-källa (Hp60 median om finns, annars Kp median),
  //    konvertera till 0..10 och skriv som 1 rad/timme.
  const out = [];
  for (const hour of [...hours].sort()) {
    // Prioritet: Hp60 MEDIAN → Hp60 MAX → Kp MEDIAN → Kp MAX → (sista fallback) Hp30
    let kpEquiv =
      hp60.median.get(hour) ??
      hp60.max.get(hour) ??
      kp.median.get(hour) ??
      kp.max.get(hour) ??
      hp30.median.get(hour) ??
      hp30.max.get(hour) ??
      null;

    if (kpEquiv == null) continue;

    const potential_score10 = toScore10(kpEquiv);
    // Ange vilken källa som faktiskt gav värdet (meta-info)
    let source = 'hpo60_median';
    if (hp60.median.has(hour)) source = 'hpo60_median';
    else if (hp60.max.has(hour)) source = 'hpo60_max';
    else if (kp.median.has(hour)) source = 'kp_median';
    else if (kp.max.has(hour)) source = 'kp_max';
    else if (hp30.median.has(hour)) source = 'hpo30_median';
    else if (hp30.max.has(hour)) source = 'hpo30_max';

    out.push({
      hour_start: hour,             // timestamptz
      potential_score10,            // NUMERIC/REAL (0..10)
      source                         // TEXT
    });
  }

  // 5) Upsert
  const { count } = await upsertPotential(out);
  console.log(`Saved ${count} rows to aurora_potential_hourly`);
  return count;
}

// Om du vill kunna köra filen direkt med: node -r dotenv/config src/lib/db/update-hpo-forecast.js
if (import.meta.url === `file://${process.argv[1]}`) {
  updateHpoForecastHourly().catch(e => {
    console.error('updateHpoForecastHourly ERR:', e);
    process.exit(1);
  });
}
