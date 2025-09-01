// server/routes-current.js
import { Router } from 'express';
import { supabase } from '../src/lib/db/client.js';
import { calculateSightabilityDetailed } from '../src/lib/astro/sightability.js';
import { CONFIG } from '../src/config/app-config.js';

// Hjälp: runda timmar för närmaste väderruta
function nearestHourISO(d = new Date()) {
  const t = new Date(d);
  const m = t.getUTCMinutes();
  if (m >= 30) t.setUTCHours(t.getUTCHours() + 1);
  t.setUTCMinutes(0, 0, 0);
  return t.toISOString();
}

const router = Router();

/**
 * GET /api/forecast/current?lat=&lon=&location= (valfritt)
 * Returnerar “Nu”-payload:
 *  - location { name, lat, lon }
 *  - current:
 *      - geomagnetic_detail (global score/kp + stale status som kod)
 *      - sightability_detail (score + breakdown som {code, params})
 *      - light_* som koder (kategori) och ev. tal
 *  - geomNow (samma globala sammanslagning som i DB, pass-through)
 */
router.get('/api/forecast/current', async (req, res) => {
  try {
    // 1) Position
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const locNameParam = (req.query.location || '').toString();

    let name = 'Umeå';
    let LAT = 63.8258, LON = 20.263;

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      LAT = lat; LON = lon; name = locNameParam || 'Custom';
    } else if (locNameParam) {
      // slå upp ev. känd location (om du vill—annars lämna som “name only”)
      const loc = await supabase
        .from('aurora_locations')
        .select('name, lat, lon')
        .ilike('name', locNameParam)
        .maybeSingle();
      if (loc.data) { name = loc.data.name; LAT = +loc.data.lat; LON = +loc.data.lon; }
      else { name = locNameParam; }
    }

    // 2) Global geomagnetik “nu” (pass-through från DB – redan 0..10 + kp_proxy)
    const geomNow = await supabase
      .from('aurora_geomagnetic_now')
      .select('time_tag, global_score, kp_proxy, stale_hours, stale_status, detail, created_at, hemi_power_gw, ae_quicklook, dst_quicklook')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const g = geomNow.data || {};
    const kpProxy = g.kp_proxy ?? 0;
    const globalScore = g.global_score ?? 0;
    const staleStatus = g.stale_status || 'unknown'; // <- KOD (översätts i klienten)
    const staleHours = g.stale_hours ?? null;

    // 3) Väderslot (moln) närmast nu för platsen
    const wx = await supabase
      .rpc('weather_nearest_for_point', { // om du inte har en RPC, ersätt med SELECT på weather_hourly + location_id
        p_lat: LAT, p_lon: LON, p_when: new Date().toISOString()
      })
      .maybeSingle()
      .catch(() => ({ data: null })); // fallback om RPC saknas

    // Fallback utan RPC: välj närmaste timraden för “Umeå”
    let cloudsPct = null;
    if (!wx?.data) {
      const nearestISO = nearestHourISO(new Date());
      const wxRows = await supabase
        .from('weather_hourly')
        .select('hour_start, total_pct')
        .eq('location_name', name) // funkar om du sparar väder per “namn”
        .eq('hour_start', nearestISO)
        .maybeSingle();
      if (wxRows.data) cloudsPct = wxRows.data.total_pct;
    } else {
      cloudsPct = wx.data.total_pct ?? null;
    }

    // 4) Ljusförorening (håll det som kod – “urban_core”/“suburban”/“rural”/“unknown”)
    // Om du har ett lätt API-lager (getLightPollution) – använd det här.
    // Annars enkel heuristik från CONFIG.lightZones (zones-provider).
    let lightCategory = 'unknown';
    if (CONFIG?.lightZones?.umea) {
      // grov zon-heuristik: mät avstånd till Umeå center
      const { center, urban_km, suburban_km } = CONFIG.lightZones.umea;
      const R = 6371; // km
      const toRad = (x) => x * Math.PI / 180;
      const dLat = toRad(LAT - center.lat);
      const dLon = toRad(LON - center.lon);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(center.lat))*Math.cos(toRad(LAT))*Math.sin(dLon/2)**2;
      const d = 2*R*Math.asin(Math.sqrt(a));
      lightCategory = d <= urban_km ? 'urban_core' : d <= suburban_km ? 'suburban' : 'rural';
    }

    // 5) Sikt-detalj (kodade breakdown-poster)
    const sightDet = calculateSightabilityDetailed({
      lat: LAT,
      lon: LON,
      when: new Date(),            // nu
      cloudsPct: typeof cloudsPct === 'number' ? cloudsPct : null,
      geomagneticScore: globalScore, // 0..10
      lightCategory
    });

    // 6) Svar – allt UI-lingvistiskt är nu KODER
    res.set('Cache-Control', 'public, max-age=15'); // kort cache
    return res.json({
      location: { name, lat: LAT, lon: LON },
      current: {
        location_name: name,
        kp_now: kpProxy,
        geomagnetic_score: globalScore,
        sightability_probability: sightDet.score, // 0..10
        updated_at: g.created_at || null,
        time_tag: g.time_tag || null,
        stale_hours: staleHours,
        stale_status: staleStatus,             // KOD: "fresh"|"slightly-stale"|...
        geomagnetic_detail: {
          source: 'blend',
          kp_proxy: kpProxy,
          global_score: globalScore
        },
        sightability_detail: sightDet,         // breakdown: [{code, params}]
        light_category: lightCategory          // KOD
      },
      geomNow: {
        time_tag: g.time_tag || null,
        global_score: globalScore,
        kp_proxy: kpProxy,
        stale_hours: staleHours,
        stale_status: staleStatus,             // KOD
        detail: g.detail || {}
      }
    });

  } catch (err) {
    console.error('[api current] fail:', err);
    return res.status(500).json({ error: 'current_failed' });
  }
});

export default router;
