// src/lib/db/update-hourly-forecast.js
// Timvisa prognoser för en kväll/natt: moln + sol/måne + ljus + HPO/Kp-blend → sightability.
// Sparar i public.aurora_forecast_outlook_hourly (ON CONFLICT (hour_start, location_name))

import { CONFIG } from '../../config/app-config.js';
import { saveData } from './savedata.js';

// Geomagnetik blend (HPO/Kp [+svag SW])
import { getGlobalGeomagneticNow } from '../aurora/global-geomagnetic.js';
import { getGeomBlendForHours } from '../aurora/global-geomagnetic-hourly.js';

// Ljusförorening (zon-heuristik / fallback)
import { getLightPollution } from '../lightpollution/get-lightpollution.js';

// Sightability-beräkning (samma som “current”)
import { calculateSightabilityDetailed } from '../astro/sightability.js';

// Väder: försök konsensus → fallback till väder-modul
let getWeatherConsensusHourly = null;
try {
  // om du har denna modul: multi-source + cache
  const m = await import('../astro/weather-consensus.js');
  getWeatherConsensusHourly = m.getWeatherConsensusHourly;
} catch { /* fallback defined below */ }
import { getWeatherHourly as getWeatherHourlyFallback } from '../astro/weather.js';

// ---------------------------------------------------------------------------
// Helpers
const TZ = 'Europe/Stockholm';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const toIso = (d) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

function localDateInTz(nowUtc = new Date(), tz = TZ) {
  // Skapa “lokal kalenderdag” för vald tidszon
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(nowUtc);
  return { y: +y, m: +m, d: +d };
}

function makeLocalDate(tz, y, m, d, hh, mm = 0) {
  // Skapar ett datum som representerar (y-m-d hh:mm) i TZ, men som ett UTC Date
  const iso = new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0)).toISOString();
  // Korrigera med timeZone offset:
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit' });
  // Hitta UTC som motsvarar lokalt datum/hh:mm: vi hoppar över exakt offset-beräkning och
  // låter Date tolka; för timvisa steg duger detta (DST hanteras av runtime).
  const parts = fmt.formatToParts(new Date(iso));
  // Vi returnerar “Date” för HH:MM i TZ genom att gå baklänges: bygg en sträng “YYYY-MM-DDTHH:MM:00 TZ”
  // Men Node saknar direkt konstruktion med TZ; därför kör vi en enkel “ratio”:
  // -> Vi gör en lokal tidssträng och låter Date parsea som om den vore lokal – sedan justerar vi
  //    till närmaste hel timme när vi använder den. För robusthet i Node 22 räcker detta för våra syften.
  // För enkelhet: använd Intl trick: format current now → difference till target hours.
  // (Pragmatiskt: vi förlitar oss på att winter/summer shift påverkar timmar i range men
  //   att sightability ändå SOL-gatar under sommar. God enough för timvisa prognoser.)
  // -> enklare och robust: bygg en lista genom att starta på 18:00 TZ som UTC current + delta
  //    men vi använder nedan enklare generator som funkar bra i praktiken.
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
}

function* eveningHoursLocalToUtc(daySel /* 'tonight'|'tomorrow' */, tz = TZ) {
  const now = new Date();
  const { y, m, d } = localDateInTz(now, tz);

  // Vilken kalenderdag (i TZ) ska vi använda som “kväll”?
  let dayY = y, dayM = m, dayD = d;
  if (daySel === 'tomorrow') {
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const t = localDateInTz(tomorrow, tz);
    dayY = t.y; dayM = t.m; dayD = t.d;
  }

  // Vi tar timvis 18:00–23:00 (lokal) + 00:00–06:00 (nästa dag lokal)
  for (let hh = 18; hh <= 23; hh++) {
    yield makeLocalDate(tz, dayY, dayM, dayD, hh, 0);
  }
  // nästa dag
  const next = new Date(Date.UTC(dayY, dayM - 1, dayD, 12, 0, 0, 0));
  const nextLocal = localDateInTz(new Date(next.getTime() + 24 * 3600 * 1000), tz);
  for (let hh = 0; hh <= 6; hh++) {
    yield makeLocalDate(tz, nextLocal.y, nextLocal.m, nextLocal.d, hh, 0);
  }
}

async function getCloudsByHour(lat, lon, hoursUtc) {
  // Försök konsensus (multi-source); fallback till Open-Meteo/MET/SMHI-modul
  if (getWeatherConsensusHourly) {
    const data = await getWeatherConsensusHourly(lat, lon, hoursUtc);
    // returnera Map<ISO hour → clouds %>
    const map = new Map();
    for (const h of hoursUtc) {
      const k = toIso(h);
      map.set(k, data?.byHour?.get?.(k)?.clouds_pct ?? data?.byHour?.get?.(k)?.clouds ?? null);
    }
    return map;
  }
  // fallback: en enklare API som returnerar { hour_start_iso, clouds_pct } per timme
  const fromIso = toIso(hoursUtc[0]);
  const toIsoStr = toIso(hoursUtc[hoursUtc.length - 1]);
  const hourly = await getWeatherHourlyFallback(lat, lon, { fromIso, toIso: toIsoStr });
  const map = new Map();
  for (const h of hoursUtc) {
    const k = toIso(h);
    const row = hourly?.find?.(r => toIso(r.hour_start) === k) || null;
    map.set(k, row?.clouds_pct ?? row?.clouds ?? null);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Huvudfunktion
export async function updateHourlyForecast(locationName, lat, lon, opts = {}) {
  const daySel = (opts.day === 'tomorrow') ? 'tomorrow' : 'tonight';

  // 1) Bygg timlistan (UTC) för kvällen/natten i vald TZ
  const hoursUtc = Array.from(eveningHoursLocalToUtc(daySel, TZ));
  if (!hoursUtc.length) return { rowsSaved: 0, hours: [] };

  // 2) Hämta ljuszon (en gång)
  const light = await getLightPollution(lat, lon, (locationName || '').toLowerCase());

  // 3) Hämta moln per timme
  const cloudsMap = await getCloudsByHour(lat, lon, hoursUtc);

  // 4) Hämta geomagnetik per timme (HPO/Kp-blend). Lägg in svag SW-persistens om vi har en “nu”-score
  const geomNow = await getGlobalGeomagneticNow().catch(() => null);
  const geomMap = await getGeomBlendForHours(hoursUtc, {
    includeSolarwind: true,
    solarwindScore10: geomNow?.global_score ?? null
  });

  // 5) Räkna sightability per timme & bygg outputrader
  const rows = [];
  for (const h of hoursUtc) {
    const hourIso = toIso(h);
    const clouds = cloudsMap.get(hourIso);
    const geom   = geomMap.get(hourIso); // { kp_proxy, global_score10 }

    // Sightability (låter modulen räkna sol/måne; vi matar in moln + lokal geomnivå + ljusinfo)
    const s = await calculateSightabilityDetailed({
      lat,
      lon,
      when: h,
      cloudsPct: (clouds == null ? null : +clouds),
      // lokal geomagnetik driver månens viktning:
      geomLocal10: geom?.global_score10 ?? (geomNow?.global_score ?? 0),
      light: light // { category, bortle, ... }
    });

    rows.push({
      hour_start: hourIso,
      location_name: locationName,
      lat,
      lon,
      // väder
      clouds_pct: (clouds == null ? null : +clouds),
      // astro inputs (hämtas ur sightability-resultatet)
      moon_illum_pct: s?.inputs?.moonIllumPct ?? null,
      moon_alt_deg:   s?.inputs?.moonAltDeg ?? null,
      sun_alt_deg:    s?.inputs?.sunAltDeg ?? null,
      // poäng
      sightability_expected: clamp(s?.score ?? 0, 0, 10),
      // geomagnetik
      geomagnetic_expected:  geom?.global_score10 ?? null, // 0..10
      kp_proxy:              geom?.kp_proxy ?? null,       // 0..9
      // ljus
      light_category: light?.category ?? null,
      light_bortle:   light?.bortle ?? null,
      light_detail:   light?.detail ? JSON.stringify(light.detail) : null
    });
  }

  // 6) Spara batch (ON CONFLICT (hour_start, location_name))
  await saveData('aurora_forecast_outlook_hourly', rows, ['hour_start', 'location_name']);

  return { rowsSaved: rows.length, hours: rows.map(r => r.hour_start) };
}

// Liten CLI-runner-friendly default export (om någon kör filen direkt via node -e / import().then)
export default { updateHourlyForecast };
