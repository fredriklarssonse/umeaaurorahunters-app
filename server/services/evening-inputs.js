// server/services/evening-inputs.js
import { config } from '../config.js';
import { findNearestLocationId } from '../data/locationsRepo.js';
import { getAuroraTimeline, getObserved } from '../data/auroraRepo.js';
import { getCloudsTimeline, getAstroTimeline } from '../data/weatherRepo.js';
import { buildSimpleMock } from '../mocks/evening.js';

function toIsoHour(d) {
  const x = new Date(d);
  x.setUTCMinutes(0,0,0);
  return x.toISOString();
}

function deriveEveningWindow(astro, minHours) {
  // Försök hitta block där solen < -6° (nautisk/astronomisk twilight) → kvällsfönster.
  const dark = astro.filter(a => (a.sun_alt_deg ?? 999) <= -6);
  if (dark.length >= 2) {
    const start = toIsoHour(dark[0].ts);
    const end = toIsoHour(dark[dark.length - 1].ts);
    return { startUtc: start, endUtc: end };
  }
  // Fallback: nu → +minHours timmar
  const now = new Date();
  const start = toIsoHour(now);
  const end = toIsoHour(new Date(now.getTime() + minHours * 3600_000));
  return { startUtc: start, endUtc: end };
}

function mergeTimeline({ aurora, clouds, astro }) {
  // Bygg en kartläggning per ts
  const byTs = new Map();

  const add = (ts) => {
    if (!byTs.has(ts)) byTs.set(ts, { ts, potential: null, visibility: null, breakdown: { visibility: [] }});
    return byTs.get(ts);
  };

  for (const a of aurora) {
    const row = add(a.ts);
    row.potential = a.potential ?? row.potential;
  }
  for (const c of clouds) {
    const row = add(c.ts);
    row.breakdown.visibility.push({ code: 'breakdown.clouds', params: c.clouds });
  }
  for (const s of astro) {
    const row = add(s.ts);
    row.breakdown.visibility.push({ code: 'breakdown.twilight', params: { elevationDeg: s.sun_alt_deg } });
    row.breakdown.visibility.push({ code: 'breakdown.moon', params: { altDeg: s.moon_alt_deg, illum: s.moon_illum } });
  }

  // Sätt en enkel "visibility" (0..10) från moln & mörker (väldigt enkel modell; kan förbättras)
  for (const r of byTs.values()) {
    const clouds = r.breakdown.visibility.find(x => x.code === 'breakdown.clouds')?.params || {};
    const low = Math.max(0, Math.min(1, (clouds.low ?? 0) > 1 ? (clouds.low/100) : (clouds.low ?? 0)));
    const mid = Math.max(0, Math.min(1, (clouds.mid ?? 0) > 1 ? (clouds.mid/100) : (clouds.mid ?? 0)));
    const high = Math.max(0, Math.min(1, (clouds.high ?? 0) > 1 ? (clouds.high/100) : (clouds.high ?? 0)));
    const totalCloudCover = Math.max(low, mid, high); // grovt

    const sunAlt = r.breakdown.visibility.find(x => x.code==='breakdown.twilight')?.params?.elevationDeg;
    let darkness = 0;
    if (typeof sunAlt === 'number') {
      if (sunAlt >= -6) darkness = 0;
      else if (sunAlt <= -18) darkness = 1;
      else darkness = (-(sunAlt) - 6) / 12;
    }

    const moon = r.breakdown.visibility.find(x => x.code==='breakdown.moon')?.params || {};
    let moonPenalty = 0;
    if (typeof moon.altDeg === 'number' && typeof moon.illum === 'number') {
      if (moon.altDeg > 0) {
        const altFactor = Math.min(1, moon.altDeg / 50);
        moonPenalty = (moon.illum > 1 ? moon.illum/100 : moon.illum) * altFactor * 0.7;
      }
    }

    const visibility01 = Math.max(0, Math.min(1, darkness * (1 - totalCloudCover) * (1 - moonPenalty)));
    r.visibility = Math.round(visibility01 * 10 * 10) / 10; // 0..10 en decimal
  }

  // Sortera på tid
  const arr = Array.from(byTs.values()).sort((a,b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return arr;
}

export async function fetchEveningPayload({ lat, lon, mock=false }) {
  const location = { name: 'Umeå', lat, lon };

  if (mock) {
    return buildSimpleMock({ location });
  }

  try {
    const locationId = await findNearestLocationId({ lat, lon });

    // prelim astro fönster (första fetchen i bredare spann: nu .. +18h)
    const now = new Date();
    const startWide = new Date(now); startWide.setUTCHours(now.getUTCHours() - 2, 0, 0, 0);
    const endWide   = new Date(now); endWide.setUTCHours(now.getUTCHours() + 18, 0, 0, 0);

    const astroWide = await getAstroTimeline({
      startUtc: startWide.toISOString(),
      endUtc: endWide.toISOString(),
      locationId
    });

    const win = deriveEveningWindow(astroWide,  config.eveningMinHours);

    const [ aurora, clouds, astro ] = await Promise.all([
      getAuroraTimeline({ startUtc: win.startUtc, endUtc: win.endUtc, locationId }),
      getCloudsTimeline({ startUtc: win.startUtc, endUtc: win.endUtc, locationId }),
      getAstroTimeline({ startUtc: win.startUtc, endUtc: win.endUtc, locationId }),
    ]);

    const timeline = mergeTimeline({ aurora, clouds, astro });
    const observed = await getObserved({ startUtc: win.startUtc, endUtc: win.endUtc, locationId });

    // "nu"-sektion
    const nowIdx = timeline.findIndex(t => new Date(t.ts) >= now);
    const idx = nowIdx >= 0 ? nowIdx : 0;
    const nowBlock = timeline[idx] || timeline[0];

    const payload = {
      location,
      now: {
        potential: nowBlock?.potential ?? 0,
        visibility: nowBlock?.visibility ?? 0,
        i18n: {
          potential: 'forecast.potential.very_low',  // sätts i UI
          visibility: 'forecast.visibility.moderate' // sätts i UI
        }
      },
      timeline,
      observed,
      meta: { version: 1, unit: 'score0_10' }
    };

    return payload;
  } catch (err) {
    console.error('fetchEveningInputs error', err);
    // fallback mock — påverkar inte graf/presentation
    return buildSimpleMock({ location });
  }
}
