// src/lib/db/upsert-astro-hourly.js
import SunCalc from 'suncalc';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Service-klient (servernyckel)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

const rad2deg = (r) => (r * 180) / Math.PI;

function floorToHour(date) {
  return new Date(Math.floor(date.getTime() / 3600000) * 3600000);
}

function ceilToHour(date) {
  const d = new Date(Math.ceil(date.getTime() / 3600000) * 3600000);
  return d;
}

function* hours(from, to) {
  let t = floorToHour(from);
  const end = floorToHour(to);
  while (t <= end) {
    yield new Date(t);
    t = new Date(t.getTime() + 3600000);
  }
}

/**
 * Beräkna ett “kvälls”-fönster för given kalenderdag (lokal tid).
 * Vi försöker använda nautisk skymning → nautisk gryning. Faller tillbaka till 18–02 lokal tid.
 */
export function computeEveningWindow({ lat, lon, dateStr }) {
  // dateStr: 'YYYY-MM-DD' (lokal tid), annars idag
  const baseLocal = dateStr
    ? new Date(`${dateStr}T12:00:00`) // “mitt på dagen” minskar kantfall
    : new Date();

  const times = SunCalc.getTimes(baseLocal, lat, lon);

  // Primärt: nautisk skymning/gryning om de finns
  let from = times.nauticalDusk || times.dusk || times.sunset;
  let to = times.nauticalDawn || times.dawn || times.sunrise;

  // Om värden saknas eller är orimliga (polarnatt/polardag), fallback: 18–02 lokal tid
  if (!from || !to || !(from instanceof Date) || !(to instanceof Date) || isNaN(from) || isNaN(to) || to <= from) {
    const y = baseLocal.getFullYear();
    const m = baseLocal.getMonth();
    const d = baseLocal.getDate();
    from = new Date(y, m, d, 18, 0, 0);
    to = new Date(y, m, d + 1, 2, 0, 0);
  }

  return { fromUTC: from, toUTC: to };
}

function computeAstroAt(dateUTC, lat, lon) {
  const sun = SunCalc.getPosition(dateUTC, lat, lon);
  const moonPos = SunCalc.getMoonPosition(dateUTC, lat, lon);
  const moonIll = SunCalc.getMoonIllumination(dateUTC);

  return {
    hour_start: floorToHour(dateUTC).toISOString(),
    sun_alt_deg: Number(rad2deg(sun.altitude).toFixed(3)),
    moon_alt_deg: Number(rad2deg(moonPos.altitude).toFixed(3)),
    moon_illum: Number((moonIll.fraction ?? 0).toFixed(3))
  };
}

/**
 * Upsertar astro_hourly för varje hel timme i [fromUTC, toUTC].
 * Obligatoriskt: { name, lat, lon }. fromUTC/toUTC kan skickas eller så skickar du dateStr och vi räknar kvällen.
 */
export async function upsertAstroHourly({ name, lat, lon, fromUTC, toUTC, dateStr }) {
  if (!name || typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error('upsertAstroHourly: name, lat, lon krävs');
  }

  if (!fromUTC || !toUTC) {
    const win = computeEveningWindow({ lat, lon, dateStr });
    fromUTC = win.fromUTC;
    toUTC = win.toUTC;
  }

  const rows = [];
  for (const h of hours(fromUTC, toUTC)) {
    const a = computeAstroAt(h, lat, lon);
    rows.push({
      location_name: name,
      hour_start: a.hour_start,
      sun_alt_deg: a.sun_alt_deg,
      moon_alt_deg: a.moon_alt_deg,
      moon_illum: a.moon_illum
    });
  }

  // Chunka ifall fönstret är långt
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('astro_hourly')
      .upsert(chunk, { onConflict: 'location_name,hour_start' });
    if (error) {
      console.error('[astro_hourly upsert] error:', error);
      throw error;
    }
  }

  return { inserted: rows.length, from: rows[0]?.hour_start, to: rows.at(-1)?.hour_start };
}
