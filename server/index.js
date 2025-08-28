// server/index.js
import { attachForecastHourlyRoutes } from './routes-forecast-hourly.js';
import express from 'express';
import cors from 'cors';
import { resolveLocationArg, recordLocationUsage, getPopularNearby, upsertLocation } from '../src/lib/locations.js';


const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));       // <-- lägg till

attachForecastHourlyRoutes(app);


const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const HDRS = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const TZ = 'Europe/Stockholm';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

async function fetchJson(url) {
  const r = await fetch(url, { headers: HDRS });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
function pickLatest(arr, field = 'updated_at') {
  if (!Array.isArray(arr) || !arr.length) return null;
  return [...arr].sort((a,b)=> new Date(b[field]||b.time_tag||0) - new Date(a[field]||a.time_tag||0))[0];
}
function parseDay(qs) {
  const v = (qs.day === 'tomorrow') ? 'tomorrow' : 'tonight';
  return v;
}
function fmtIso(iso) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
    weekday: 'short', day: '2-digit', month: 'short'
  }).format(new Date(iso));
}
async function getLoc(req) {
  if (req.query.lat && req.query.lon) {
    const lat = +req.query.lat, lon = +req.query.lon;
    return { name: `${lat.toFixed(5)},${lon.toFixed(5)}`, lat, lon };
  }
  const key = (req.query.location || 'umea').toString();
  return await resolveLocationArg(key);
}

/* GET /api/forecast/current?location=umea | ?lat=..&lon=.. */
// server/index.js (ersätt endast denna route)
// ===== /api/forecast/current (robust) =====
// server/index.js (ersätt endast denna route)
// ===== /api/forecast/current (robust) =====
app.get('/api/forecast/current', async (req, res) => {
  try {
    const { location: locArg, lat: qLat, lon: qLon, fresh } = req.query;
    const { supabase } = await import('../src/lib/db/client.js');

    // 1) Canonical map (hanterar vanliga namn/diakritik)
    const KNOWN = {
      'umea':      { name: 'Umeå',      lat: 63.8258, lon: 20.2630 },
      'umeå':      { name: 'Umeå',      lat: 63.8258, lon: 20.2630 },
      'ostersund': { name: 'Östersund', lat: 63.1790, lon: 14.6350 },
      'östersund': { name: 'Östersund', lat: 63.1790, lon: 14.6350 }
    };

    const parseLatLon = (s) => {
      if (!s) return null;
      const m = String(s).trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      return m ? { lat: +m[1], lon: +m[2] } : null;
    };

    // 2) Bestäm plats
    let loc = null;

    // a) query-param lat/lon vinner
    if (qLat && qLon) {
      loc = { name: locArg || 'custom', lat: +qLat, lon: +qLon };
    }

    // b) om inte, tolka location-sträng (“lat,lon” eller namn)
    if (!loc) {
      const raw = (locArg || 'umea').trim();
      const asLL = parseLatLon(raw);
      if (asLL) {
        loc = { name: 'custom', lat: asLL.lat, lon: asLL.lon };
      } else {
        const key = raw.toLowerCase();
        if (KNOWN[key]) {
          loc = { ...KNOWN[key] };
        } else {
          // c) leta i DB efter senast kända plats med liknande namn
          const { data: found } = await supabase
            .from('aurora_locations')
            .select('name,lat,lon')
            .ilike('name', raw)   // accent-känsligt ibland, men funkar ofta
            .limit(1)
            .maybeSingle();

          if (found?.name) {
            loc = { name: found.name, lat: +found.lat, lon: +found.lon };
          } else {
            // fallback: Umeå
            loc = { ...KNOWN['umea'] };
          }
        }
      }
    }

    // 3) Fresh-uppdatering (skriver in current-raden)
    if (fresh === '1') {
      try {
        const { updateForecast } = await import('../src/lib/db/update-forecast.js');
        await updateForecast(loc.name, loc.lat, loc.lon);
      } catch (e) {
        console.warn('[fresh updateForecast] warning:', e?.message || e);
      }
    }

    // 4) Läs ut current för den kanoniska platsen
    let current = null;
    {
      const { data, error } = await supabase
        .from('aurora_forecast_current')
        .select('*')
        .eq('location_name', loc.name)
        .maybeSingle();
      if (error) throw error;
      current = data || null;
    }

    // 5) Läs ut senaste geomNow (global, inte per plats)
    let geomNow = null;
    {
      const { data, error } = await supabase
        .from('aurora_geomagnetic_now')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      geomNow = data || null;
    }

    // Om current saknas (t.ex. ny plats), försök ett sista “fresh”
    if (!current) {
      try {
        const { updateForecast } = await import('../src/lib/db/update-forecast.js');
        await updateForecast(loc.name, loc.lat, loc.lon);
        const { data } = await supabase
          .from('aurora_forecast_current')
          .select('*')
          .eq('location_name', loc.name)
          .maybeSingle();
        current = data || null;
      } catch (e) {
        console.warn('[second-chance updateForecast] warning:', e?.message || e);
      }
    }

    res.json({ location: loc, current, geomNow });
  } catch (err) {
    console.error('[api current] fail:', err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});



/* GET /api/forecast/hourly?location=umea&day=tonight|tomorrow */
app.get('/api/forecast/hourly', async (req, res) => {
  try {
    const loc = await getLoc(req);
    if (!loc) return res.status(400).json({ error: 'location not found' });
    const day = parseDay(req.query);

    const url = `${BASE}/rest/v1/aurora_forecast_outlook_hourly?location_name=eq.${encodeURIComponent(loc.name)}&select=*`
              + `&order=hour_start.asc`;

    const rows = await fetchJson(url);
    const now = new Date();
    const isTonight = (d) => {
      const dt = new Date(d);
      // enkel delning: samma UTC-datum eller timmar < 6 → "ikväll"-block
      return dt.getUTCDate() === now.getUTCDate() || dt.getUTCHours() < 6;
    };
    const tonightRows  = rows.filter(r => isTonight(r.hour_start));
    const tomorrowRows = rows.filter(r => !isTonight(r.hour_start));

    await recordLocationUsage(loc.id, 'forecast').catch(()=>{});
    res.json({ location: loc, day, hours: day==='tomorrow' ? tomorrowRows : tonightRows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* GET /api/locations/nearby?lat=..&lon=..&radiusKm=60 */
app.get('/api/locations/nearby', async (req, res) => {
  try {
    const lat = +req.query.lat, lon = +req.query.lon;
    const radiusKm = req.query.radiusKm ? clamp(+req.query.radiusKm, 1, 200) : 60;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'lat/lon required' });
    const list = await getPopularNearby(lat, lon, { radiusKm, limit: 10 });
    res.json({ lat, lon, radiusKm, locations: list });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/* POST /api/locations  body:{name?, lat, lon} */
app.post('/api/locations', async (req, res) => {
  try {
    const { name, lat, lon } = req.body || {};
    if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return res.status(400).json({ error: 'lat/lon required' });
    const loc = await upsertLocation({ name, lat:+lat, lon:+lon, source: 'user' });
    await recordLocationUsage(loc.id, 'submit').catch(()=>{});
    res.json(loc);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
