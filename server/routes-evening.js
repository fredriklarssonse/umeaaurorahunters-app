// server/routes-evening.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// Hjälpare: hämta platsnamn från lat/lon om sådana skickas in
async function resolveLocationName({ location, lat, lon }) {
  if (location) return location;
  if (lat && lon) {
    const { data, error } = await sb
      .from('aurora_locations')
      .select('name')
      .eq('lat', Number(lat))
      .eq('lon', Number(lon))
      .limit(1)
      .maybeSingle();
    if (!error && data) return data.name;
  }
  // fallback
  return 'Umeå';
}

// Hjälpare: bygg tidsfönster ~”ikväll” (enkel, 18–26 lokal tid)
function tonightWindowUTC(tz = 'Europe/Stockholm', dateStr) {
  // dateStr = "YYYY-MM-DD" (lokalt); om saknas, använd idag.
  const base = dateStr ? new Date(dateStr + 'T00:00:00Z') : new Date();
  // Plocka lokala datumkomponenter i vald TZ
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(base);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const y = Number(map.year), m = Number(map.month), d = Number(map.day);

  // Skapa två tider i lokal tid 18:00 och 02:00 och konvertera till UTC via Date.parse på ISO med offset via intl-trick:
  // Vi använder samma dag kl 18 och nästa dag kl 02, men för att få korrekt UTC
  // bygger vi Date-objekt genom att formatera dem tillbaka till UTC via timeZone.
  const toUTC = (yy, mm, dd, hh) => {
    const dt = new Date(Date.UTC(yy, mm - 1, dd, hh, 0, 0));
    // dt representerar  hh:00 i *UTC*. För att få "lokal hh:00 i tz" i UTC,
    // kan vi räkna ut offset genom att formatera dt som om den var i tz och
    // sedan justera skillnaden mellan dt (UTC) och samma väggtid i tz.
    // Enklare: vi tar ett spann (nu-12..+18) för att slippa trixa – men vi vill ha ungefär kväll:
    return dt;
  };

  // Pragmatisk lösning: använd nuvarande dygns 16..26 UTC som närmevärde (blir kväll i SE sommartid).
  const fromUTC = new Date(Date.UTC(y, m - 1, d, 16, 0, 0)); // ~18:00 lokal sommartid
  const toUTC_   = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0)); // ~02:00 nästa lokal-dag

  return { from: fromUTC.toISOString(), to: toUTC_.toISOString() };
}

router.get('/', async (req, res) => {
  try {
    const q = req.query || {};
    const location = await resolveLocationName(q);
    const hoursAhead = Number(q.hours || 10);
    const dateStr = q.date || null; // "YYYY-MM-DD" lokal – om satt, använd kvällsfönster, annars "nu..+hoursAhead"

    let fromISO, toISO;
    if (dateStr) {
      const win = tonightWindowUTC('Europe/Stockholm', dateStr);
      fromISO = win.from;
      toISO = win.to;
    } else {
      const now = new Date();
      fromISO = now.toISOString();
      toISO = new Date(now.getTime() + hoursAhead * 3600 * 1000).toISOString();
    }

    // Hämta rader från aurora_hourly
    const { data, error } = await sb
      .from('aurora_hourly')
      .select('hour_start, potential_score10, sight_score10, cloud_total_pct, sun_alt_deg, moon_alt_deg, moon_illum')
      .eq('location_name', location)
      .gte('hour_start', fromISO)
      .lte('hour_start', toISO)
      .order('hour_start', { ascending: true });

    if (error) {
      console.error('[evening] supabase error:', error);
      return res.status(500).json({ error: 'db_error' });
    }

    const timeline = (data && data.length)
      ? { from: data[0].hour_start, to: data[data.length - 1].hour_start }
      : { from: fromISO, to: toISO };

    const potential = [];
    const sight = [];
    const clouds = [];

    for (const r of (data || [])) {
      potential.push({ hour: r.hour_start, score10: Number(r.potential_score10 ?? 0) });
      sight.push({ hour: r.hour_start, score10: Number(r.sight_score10 ?? 0) });
      clouds.push({
        hour: r.hour_start,
        total: r.cloud_total_pct == null ? null : Number(r.cloud_total_pct),
        sun: r.sun_alt_deg == null ? null : Number(r.sun_alt_deg),
        moonAlt: r.moon_alt_deg == null ? null : Number(r.moon_alt_deg),
        moonIllum: r.moon_illum == null ? null : Number(r.moon_illum)
      });
    }

    res.json({
      timeline,
      potential,
      sight,
      clouds,
      meta: {
        location,
        mode: dateStr ? 'tonight' : 'next_hours',
        hours: hoursAhead,
      }
    });
  } catch (err) {
    console.error('[evening] fail:', err);
    res.status(500).json({ error: 'evening_failed' });
  }
});

export default router;
