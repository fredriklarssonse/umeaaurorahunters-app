// server/routes-hourly.js
import express from 'express';
import { supabase } from './db-client.js';
import { calculateSightabilityDetailed } from '../src/lib/astro/sightability.js';

const router = express.Router();

/** Hjälp: runda upp/ned till heltimme i UTC */
function ceilToHourUTC(d) {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  if (d > x) x.setUTCHours(x.getUTCHours() + 1);
  return x;
}
function floorToHourUTC(d) {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  return x;
}
function hoursBetweenUTC(from, to) {
  const arr = [];
  let t = ceilToHourUTC(from);
  const end = floorToHourUTC(to);
  while (t <= end) {
    arr.push(new Date(t));
    t = new Date(t.getTime() + 60 * 60 * 1000);
  }
  return arr;
}

/** Plats: lat/lon i query, annars Umeå som default */
function resolveLocation(q) {
  const lat = q.lat != null ? Number(q.lat) : 63.8258;
  const lon = q.lon != null ? Number(q.lon) : 20.263;
  const name = q.location ? decodeURIComponent(q.location) : 'Umeå';
  return { name, lat, lon };
}

/** Tidsintervall: ?from,?to (ISO). Annars nu-2h..nu+10h. */
function resolveRange(q) {
  if (q.from && q.to) {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (!isNaN(from) && !isNaN(to) && to > from) return { from, to, source: 'query' };
  }
  const now = new Date();
  return {
    from: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    to: new Date(now.getTime() + 10 * 60 * 60 * 1000),
    source: 'default'
  };
}

/** Hämta global geomagnetik (score 0..10) för fallback */
async function getGeomNowScore10() {
  const { data, error } = await supabase
    .from('aurora_geomagnetic_now')
    .select('global_score')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[hourly] geomagnetic_now error:', error.message);
    return null;
  }
  return data?.global_score ?? null;
}

/** GET /api/hourly?lat=&lon=&location=&from=&to= */
router.get('/api/hourly', async (req, res) => {
  try {
    const loc = resolveLocation(req.query);
    const range = resolveRange(req.query);
    const hours = hoursBetweenUTC(range.from, range.to);

    // === POTENTIAL: aurora_hourly (inkl. potential_source) ===
    let { data: potRows, error: potErr } = await supabase
      .from('aurora_hourly')
      .select('hour_start, potential_score10, potential_source')
      .eq('location_name', loc.name)
      .gte('hour_start', range.from.toISOString())
      .lte('hour_start', range.to.toISOString())
      .order('hour_start', { ascending: true });

    if (potErr) {
      console.warn('[hourly] potential error:', potErr.message);
      potRows = [];
    }

    const potMap = new Map(
      (potRows || []).map(r => [
        new Date(r.hour_start).toISOString(),
        {
          score10: Number(r.potential_score10 || 0),
          source: r.potential_source || null
        }
      ])
    );

    // Hämta geom-now EN gång; använd endast för hål
    const geomFallback = await getGeomNowScore10();

    const potential = hours.map(h => {
      const key = h.toISOString();
      const found = potMap.get(key);
      if (found) {
        return { hour: key, score10: found.score10, source: found.source };
      }
      // per-timme fallback
      return {
        hour: key,
        score10: geomFallback != null ? Number(geomFallback) : 0,
        source: geomFallback != null ? 'blend' : null
      };
    });

    // === CLOUDS: weather_hourly (tål _pct eller plain) ===
    let { data: wxRows, error: wxErr } = await supabase
      .from('weather_hourly')
      .select('hour_start, low_pct, mid_pct, high_pct, total_pct, low, mid, high, total, source')
      .eq('location_name', loc.name)
      .gte('hour_start', range.from.toISOString())
      .lte('hour_start', range.to.toISOString())
      .order('hour_start', { ascending: true });

    if (wxErr) {
      console.warn('[hourly] weather error:', wxErr.message);
      wxRows = [];
    }

    const wxMap = new Map(
      (wxRows || []).map(r => {
        const low = r.low_pct ?? r.low ?? null;
        const mid = r.mid_pct ?? r.mid ?? null;
        const high = r.high_pct ?? r.high ?? null;
        const tot = r.total_pct ?? r.total ?? null;
        return [new Date(r.hour_start).toISOString(), { low, mid, high, total: tot }];
      })
    );

    const clouds = hours.map(h => {
      const key = h.toISOString();
      return { hour: key, ...(wxMap.get(key) || { low: null, mid: null, high: null, total: null }) };
    });

    // === SIGHT: beräkna per timme (moln total + potential 0..10) ===
    const sight = [];
    for (const h of hours) {
      const key = h.toISOString();
      const c = wxMap.get(key);
      const cTot = c?.total != null ? Number(c.total) : null;
      const pot = potential.find(p => p.hour === key)?.score10 ?? 0;

      const det = calculateSightabilityDetailed({
        lat: loc.lat,
        lon: loc.lon,
        when: new Date(key),
        cloudsPct: cTot,
        geomagneticScore: pot
      });

      sight.push({
        hour: key,
        score10: Number(det.score || 0),
        breakdown: det.breakdown || [],
        inputs: det.inputs || null
      });
    }

    // === SVAR ===
    res.setHeader('Cache-Control', 'public, max-age=60'); // 1 min
    res.json({
      timeline: {
        from: ceilToHourUTC(range.from).toISOString(),
        to: floorToHourUTC(range.to).toISOString()
      },
      potential, // <-- inkluderar {hour, score10, source} (hpo/kp/blend)
      sight,
      clouds,
      meta: {
        lat: loc.lat,
        lon: loc.lon,
        location: { name: loc.name },
        rangeSource: range.source
      }
    });
  } catch (err) {
    console.error('[hourly] fail:', err);
    res.status(500).json({ error: 'hourly_failed' });
  }
});

export default router;
