// src/lib/db/update-hpo-forecast.js
import { fetchHp60Json, fetchHp30Json, normalizeHp60, normalizeHp30 } from '../aurora/fetch-hpo-forecast.js';
import { saveData } from './savedata.js';

const floorHourIso = (t) => { const d = new Date(t); d.setUTCMinutes(0,0,0); return d.toISOString(); };

function mergeHpRows(h60 = [], h30 = []) {
  const map = new Map();
  for (const r of h60) {
    const k = floorHourIso(r.hour_start);
    map.set(k, {
      hour_start: k,
      hp60_median: r.hp60_median ?? null,
      hp60_max: r.hp60_max ?? null,
      hp30_median: null,
      hp30_max: null,
      source: 'GFZ mean_bars'
    });
  }
  for (const r of h30) {
    const k = floorHourIso(r.hour_start);
    const row = map.get(k) || { hour_start: k, source: 'GFZ mean_bars' };
    row.hp30_median = r.hp30_median ?? row.hp30_median ?? null;
    row.hp30_max    = r.hp30_max ?? row.hp30_max ?? null;
    map.set(k, row);
  }
  return Array.from(map.values()).sort((a,b)=> new Date(a.hour_start) - new Date(b.hour_start));
}

export async function updateHpoForecastHourly() {
  try {
    console.log('[HPO] hp60 url =', process.env.HPO_HP60_JSON || '(config)');
    console.log('[HPO] hp30 url =', process.env.HPO_HP30_JSON || '(config)');

    const j60 = await fetchHp60Json();
    const j30 = await fetchHp30Json();

    const r60 = j60 ? normalizeHp60(j60) : [];
    const r30 = j30 ? normalizeHp30(j30) : [];

    console.log(`[HPO] parsed: hp60=${r60.length} rows, hp30=${r30.length} rows`);
    const rows = mergeHpRows(r60, r30);
    console.log(`[HPO] merged rows = ${rows.length}`);

    if (rows.length) {
      await saveData('aurora_hpo_forecast_hourly', rows, ['hour_start']);
    } else {
      console.warn('[HPO] Nothing to save (0 rows)');
    }
    return { rowsSaved: rows.length };
  } catch (e) {
    console.error('[HPO] update failed:', e?.message || e);
    return { rowsSaved: 0, error: String(e?.message || e) };
  }
}
