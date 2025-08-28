// src/lib/aurora/global-geomagnetic-hourly.js
import { CONFIG } from '../../config/app-config.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const toIso = (d) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/** Hämta rader för ett tabellintervall i en query */
async function fetchRowsInRange(table, fromIso, toIso) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return [];

  const url = `${base}/rest/v1/${table}`
    + `?select=*`
    + `&hour_start=gte.${encodeURIComponent(fromIso)}`
    + `&hour_start=lte.${encodeURIComponent(toIso)}`
    + `&order=hour_start.asc`;

  const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

/**
 * Blandar HPO (Hp60 MEDIAN) + Kp (timvis) + ev. solvind-persistens (svag).
 * Returnerar Map<stringISO, { kp_proxy:number, global_score10:number }>
 *
 * @param {Date[]} hoursUtc - lista av UTC-helttimmar (Date-objekt) för kvällsfönstret
 * @param {object} opts     - { includeSolarwind:boolean=false, solarwindScore10?:number }
 */
export async function getGeomBlendForHours(hoursUtc, opts = {}) {
  const hoursIso = hoursUtc.map(toIso);
  if (!hoursIso.length) return new Map();

  const fromIso = hoursIso[0];
  const toIso   = hoursIso[hoursIso.length - 1];

  // Hämta allt i två SQL-anrop
  const [hpoRows, kpRows] = await Promise.all([
    fetchRowsInRange('aurora_hpo_forecast_hourly', fromIso, toIso),
    fetchRowsInRange('kp_forecast_hourly', fromIso, toIso),
  ]);

  // Indexera per timme
  const HPO = new Map();
  for (const r of hpoRows) {
    const t = toIso(r.hour_start);
    const hp = r.hp60_median;
    if (hp == null || !Number.isFinite(+hp)) continue;
    // Hp60 MEDIAN ~ Kp-lik (0..~9) → score10
    const kp_equiv = clamp(+hp, 0, 12);
    const score10  = clamp((kp_equiv / 9) * 10, 0, 10);
    HPO.set(t, { kp_equiv, score10 });
  }

  const KP = new Map();
  for (const r of kpRows) {
    const t = toIso(r.hour_start);
    const k = r.kp_predicted;
    if (k == null || !Number.isFinite(+k)) continue;
    const kp_equiv = clamp(+k, 0, 9);
    const score10  = clamp((kp_equiv / 9) * 10, 0, 10);
    KP.set(t, { kp_equiv, score10 });
  }

  // (Valfritt) svag solvind-persistens-komponent
  let SW = null;
  if (opts.includeSolarwind && Number.isFinite(+opts.solarwindScore10)) {
    const s = clamp(+opts.solarwindScore10, 0, 10);
    SW = { kp_equiv: clamp(s * 0.9, 0, 9), score10: s };
  }

  const blend = CONFIG.geomagnetic?.blend || { w_hpo: 0.55, w_kp: 0.15, w_sw: 0.10 };
  const out = new Map();

  for (const t of hoursIso) {
    const parts = [];
    if (HPO.has(t)) parts.push({ ...HPO.get(t), w: blend.w_hpo ?? 0.55 });
    if (KP.has(t))  parts.push({ ...KP.get(t),  w: blend.w_kp  ?? 0.15 });
    if (SW)         parts.push({ ...SW,         w: blend.w_sw  ?? 0.10 });

    if (!parts.length) continue;

    const W = parts.reduce((a,p)=> a + (isFinite(p.w) ? p.w : 0), 0) || 1;
    for (const p of parts) p.wn = (isFinite(p.w) ? p.w : 0) / W;

    const kp_proxy  = parts.reduce((a,p)=> a + (p.kp_equiv * p.wn), 0);
    const score10   = parts.reduce((a,p)=> a + (p.score10  * p.wn), 0);

    out.set(t, {
      kp_proxy: clamp(kp_proxy, 0, 9),
      global_score10: clamp(score10, 0, 10),
      detail: parts.map(p => ({ kp_equiv: p.kp_equiv, score10: p.score10, w: p.wn }))
    });
  }

  return out;
}
