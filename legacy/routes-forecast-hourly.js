// server/routes-forecast-hourly.js
import express from 'express';
import { supabase } from '../src/lib/db/client.js';
import { buildHourlyForecast } from '../src/lib/forecast/build-hourly.js';

// enkel platsupplösning: lat/lon direkt, annars hämta från DB, fallback Umeå
async function resolveLocation(qs) {
  if (qs.lat && qs.lon) {
    const lat = Number(qs.lat), lon = Number(qs.lon);
    return { name: qs.location || 'custom', lat, lon };
  }
  if (qs.location) {
    const nameQ = String(qs.location);
    // prova exakt, annars ILIKE-prefix
    const { data } = await supabase
      .from('aurora_locations')
      .select('name, latitude, longitude')
      .or(`name.eq.${nameQ},name.ilike.${nameQ}%`)
      .limit(1);
    if (data && data[0]) {
      return { name: data[0].name, lat: Number(data[0].latitude), lon: Number(data[0].longitude) };
    }
  }
  // fallback Umeå
  return { name: 'Umeå', lat: 63.8258, lon: 20.2630 };
}

export function attachForecastHourlyRoutes(app) {
  const router = express.Router();

  // GET /api/forecast/hourly?location=umea | ?lat=..&lon=.. [&dayOffset=0|1]
  router.get('/hourly', async (req, res) => {
    try {
      const loc = await resolveLocation(req.query || {});
      const dayOffset = Number.isFinite(+req.query.dayOffset) ? +req.query.dayOffset : 0;

      const result = await buildHourlyForecast({
        name: loc.name, lat: loc.lat, lon: loc.lon, dayOffset
      });

      // logga enkel event (frivilligt)
      try {
        await supabase.from('aurora_location_events').insert({
          location_name: loc.name,
          lat: loc.lat, lon: loc.lon,
          event_type: 'hourly_api',
          payload: { dayOffset }
        });
      } catch {}

      res.json(result);
    } catch (e) {
      console.error('[api hourly] fail:', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.use('/api/forecast', router);
}
