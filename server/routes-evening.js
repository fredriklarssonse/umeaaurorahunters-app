// server/routes-evening.js
import { Router } from 'express';
import { supabase } from '../src/lib/db/client.js';
import { calculateSightabilityDetailed } from '../src/lib/astro/sightability.js';
import { nightWindowForDate } from '../src/lib/astro/night-window.js'; // din befintliga helper
import { CONFIG } from '../src/config/app-config.js';

const router = Router();

function isoFloorHour(d) {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  return x.toISOString();
}
function toISO(d) { return new Date(d).toISOString(); }

/**
 * GET /api/evening?lat=&lon=&date=YYYY-MM-DD
 * Returnerar:
 *  - timeline { from, to }
 *  - potential: [{ hour, score10, source? }]
 *  - sight:     [{ hour, score10, breakdown:[{code,params}], inputs }]
 *  - clouds:    [{ hour, low, mid, high, total }]
 *  - summary:   { best_hour, dark_window, trend }
 *  - meta:      { lat, lon, requested_date, adjusted_to?, location?, windowSource }
 */
router.get('/api/evening', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const dateQ = (req.query.date || '').toString(); // YYYY-MM-DD eller tomt
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'bad_latlon' });
    }

    // 1) Bestäm kvällsfönster (SunCalc eller fallback)
    const { fromUTC, toUTC, source: winSource } = await nightWindowForDate({ lat, lon, dateStr: dateQ });
    const from = new Date(fromUTC);
    const to   = new Date(toUTC);
    const fromISO = isoFloorHour(from);
    const toISO   = isoFloorHour(to);

    // 2) POTENTIAL (HPO/Kp) under kvällen – redan 0..10 i aurora_potential_hourly
    const potRows = await supabase
      .from('aurora_potential_hourly')
      .select('hour_start, potential_score10, potential_source')
      .gte('hour_start', fromISO)
      .lte('hour_start', toISO)
      .order('hour_start', { ascending: true });

    let potential = [];
    if (potRows.data && potRows.data.length) {
      potential = potRows.data.map(r => ({
        hour: toISO(r.hour_start),
        score10: +Number(r.potential_score10 || 0).toFixed(6),
        source: r.potential_source || null
      }));
    } else {
      // fallback: läs senaste globala geomagnetik (för att inte bli tomt)
      const g = await supabase
        .from('aurora_geomagnetic_now')
        .select('global_score')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const s = (g.data?.global_score ?? 0);
      const hours = [];
      for (let t = new Date(fromISO); t <= new Date(toISO); t.setUTCHours(t.getUTCHours() + 1)) {
        hours.push(new Date(t));
      }
      potential = hours.map(h => ({ hour: h.toISOString(), score10: +s.toFixed(2), source: 'blend' }));
    }

    // 3) MOLN (weather_hourly)
    const wxRows = await supabase
      .from('weather_hourly')
      .select('hour_start, low_pct, mid_pct, high_pct, total_pct')
      .eq('location_name', req.query.location || 'Umeå') // valfritt om du vill knyta till namn, annars kan vi mappa via lat/lon-id
      .gte('hour_start', fromISO)
      .lte('hour_start', toISO)
      .order('hour_start', { ascending: true });

    const cloudsByHour = new Map();
    if (wxRows.data) {
      wxRows.data.forEach(r => {
        cloudsByHour.set(toISO(r.hour_start), {
          low: r.low_pct ?? null,
          mid: r.mid_pct ?? null,
          high: r.high_pct ?? null,
          total: r.total_pct ?? null
        });
      });
    }

    // 4) SIGHT per timme – bygg med kodade breakdown-poster
    //    (lightCategory: hämta från din lightpollution/zones om du vill – här enkel default)
    const lightCategory = 'urban_core'; // byt till real från ditt light-API om tillgängligt

    const sight = potential.map(p => {
      const c = cloudsByHour.get(p.hour);
      const cloudsPct = (c && typeof c.total === 'number') ? c.total : null;
      const det = calculateSightabilityDetailed({
        lat, lon,
        when: new Date(p.hour),
        cloudsPct,
        geomagneticScore: p.score10,     // potential i 0..10
        lightCategory
      });
      return {
        hour: p.hour,
        score10: det.score,
        breakdown: det.breakdown,        // <- { code, params }[]
        inputs: det.inputs
      };
    });

    // 5) timeline/summary
    const best = sight.reduce((acc, s) => (s.score10 > acc.score ? { hour: s.hour, score: s.score10 } : acc), { hour: fromISO, score: 0 });
    const summary = {
      best_hour: { hour: best.hour, sight: +best.score.toFixed(2) },
      dark_window: { from: from.toISOString(), to: to.toISOString(), source: winSource },
      trend: 'flat'
    };

    // 6) clouds-array i svar (för UI)
    const clouds = potential.map(p => {
      const c = cloudsByHour.get(p.hour) || {};
      return { hour: p.hour, low: c.low ?? null, mid: c.mid ?? null, high: c.high ?? null, total: c.total ?? null };
    });

    // 7) svar
    res.set('Cache-Control', 'public, max-age=60'); // 1 min cache för kväll
    return res.json({
      timeline: { from: from.toISOString(), to: to.toISOString() },
      potential,
      sight,
      clouds,
      events: [],
      cameras: [],
      sat: { frames: [] },
      summary,
      meta: {
        lat, lon,
        requested_date: dateQ || null,
        adjusted_to: null,
        location: null, // lägg in din location-info om du har
        windowSource: winSource
      }
    });

  } catch (err) {
    console.error('[evening]', err);
    return res.status(500).json({ error: 'evening_failed' });
  }
});

export default router;
