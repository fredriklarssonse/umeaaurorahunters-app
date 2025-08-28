// src/lib/astro/sightability.js
// Robust import som fungerar både för CJS och ESM-varianter av 'suncalc'
import SunCalcMod from 'suncalc';
const SunCalc = (SunCalcMod && SunCalcMod.getPosition)
  ? SunCalcMod
  : (SunCalcMod?.default && SunCalcMod.default.getPosition ? SunCalcMod.default : SunCalcMod);

import { CONFIG } from '../../config/app-config.js';

const clamp   = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const clamp10 = (x) => Math.max(0, Math.min(10, x));
const deg = (r) => r * 180 / Math.PI;

/**
 * Ljusföroreningsfaktor (Bortle ~1..8). 1.0 = ingen dämpning, lägre = mer dämpning.
 */
function lightMultiplier(light) {
  const bortle = Number(light?.bortle ?? light?.detail?.bortle ?? 0) || 0;
  const t = {1:1.00,2:0.97,3:0.94,4:0.90,5:0.85,6:0.77,7:0.68,8:0.60};
  return t[bortle] ?? 0.85;
}

/**
 * Mjuk skymningsdämpning. Tillåter starkt norrsken att “skina igenom” mellan [fromDeg, toDeg].
 */
function sunTwilightFactor(sunAltDeg, geomLocal10 = 0, cfg = {}) {
  const from = cfg.fromDeg ?? -8;
  const to = cfg.toDeg ?? 0;
  const allowMax = cfg.allowanceMax ?? 0.35;

  if (sunAltDeg >= 0) return 0;        // dagsljus
  if (sunAltDeg <= from) return 1;     // natt

  const z = clamp((sunAltDeg - from) / (to - from), 0, 1); // 0..1 när vi närmar oss 0°
  const baseline  = 1 - z;                                  // mer dämpning nära 0°
  const strength  = clamp((geomLocal10 - 5) / 5, 0, 1);     // 0..1 över 5/10 i styrka
  const allowance = z * strength * allowMax;
  return clamp(baseline + allowance, 0, 1);
}

/**
 * Molnfaktor (ingen data => neutral = 1.0).
 */
function cloudsMultiplier(cloudsPct) {
  if (cloudsPct == null) return 1; // neutral vid saknad data
  const c = clamp((Number(cloudsPct) ?? 0) / 100, 0, 1);
  const lin = 1 - c;
  // extra dämpning vid väldigt tjockt molntäcke
  const extra = c >= 0.8 ? 0.85 : 1.0;
  return clamp(lin * extra, 0, 1);
}

/**
 * Månfaktor – svagare effekt om norrskenet är starkt.
 */
function moonPenaltyMultiplier(moonAltDeg, moonIllumFrac, geomLocal10) {
  const vis  = clamp(((moonAltDeg ?? -90) + 2) / 20, 0, 1); // ramp från -2..+18°
  const illum = clamp(moonIllumFrac ?? 0, 0, 1);
  const base  = vis * illum;

  const wLow  = CONFIG?.sightability?.weights?.moonLowGeo  ?? 1.2;
  const wHigh = CONFIG?.sightability?.weights?.moonHighGeo ?? 0.35;
  // t=1 när geomagnetiken är låg (månen stör mer), t=0 när den är hög (månen stör mindre)
  const t = clamp((5 - (geomLocal10 ?? 0)) / 5, 0, 1);
  const w = wLow * t + wHigh * (1 - t);

  return clamp(1 - w * base * 0.6, 0.5, 1); // min 0.5, max 1.0
}

/**
 * Huvud: beräkna synbarhet detaljerat.
 * Använder SunCalc för sol/måne (höjd och illumination) för att matcha Photo Ephemeris.
 */
export async function calculateSightabilityDetailed(opts) {
  const {
    lat, lon, when = new Date(),
    cloudsPct = null, geomLocal10 = 0, light = null,
    // valfria overrides – annars beräknas med SunCalc:
    sunAltitude: sunAltIn = null,
    moonAltitude: moonAltIn = null,
    moonIllumination: moonIllumIn = null
  } = opts || {};

  const date = (when instanceof Date) ? when : new Date(when);

  // --- SunCalc: solposition
  let sunAltDeg;
  if (sunAltIn != null) {
    sunAltDeg = Number(sunAltIn);
  } else {
    const sun = SunCalc.getPosition(date, lat, lon);
    sunAltDeg = deg(sun.altitude); // rad -> deg
  }

  // --- SunCalc: månposition + illumination
  let moonAltDeg, moonIllumFrac;
  if (moonAltIn != null) {
    moonAltDeg = Number(moonAltIn);
  } else {
    const mp = SunCalc.getMoonPosition(date, lat, lon);      // alt i rad
    moonAltDeg = deg(mp.altitude);
  }
  if (moonIllumIn != null) {
    moonIllumFrac = clamp(Number(moonIllumIn), 0, 1);
  } else {
    const mi = SunCalc.getMoonIllumination(date);            // fraction 0..1
    moonIllumFrac = clamp(mi.fraction, 0, 1);
  }

  // Faktorer
  const sunMult   = sunTwilightFactor(sunAltDeg, geomLocal10, CONFIG?.sightability?.twilight);
  const cloudMult = cloudsMultiplier(cloudsPct);
  const moonMult  = moonPenaltyMultiplier(moonAltDeg, moonIllumFrac, geomLocal10);
  const lightMult = lightMultiplier(light);

  const raw   = 10 * sunMult * cloudMult * moonMult * lightMult;
  const score = clamp10(raw);

  // Breakdown (förklaring)
  const breakdown = [];
  if (sunAltDeg >= 0) {
    breakdown.push({ label: `[TWILIGHT-V1/SunCalc] DAGSLJUS: Sol ${sunAltDeg.toFixed(1)}° ⇒ mycket svårt (solfaktor=${sunMult.toFixed(2)})`, contribution: 0 });
  } else if (sunAltDeg > (CONFIG?.sightability?.sunGateDeg ?? -8)) {
    breakdown.push({ label: `[TWILIGHT-V1/SunCalc] SKYMNING: Sol ${sunAltDeg.toFixed(1)}° ⇒ dämpning, starkt norrsken kan synas (solfaktor=${sunMult.toFixed(2)})`, contribution: 0 });
  } else {
    breakdown.push({ label: `[TWILIGHT-V1/SunCalc] NATT: Sol ${sunAltDeg.toFixed(1)}° ≤ ${(CONFIG?.sightability?.sunGateDeg ?? -8)}° (solfaktor=${sunMult.toFixed(2)})`, contribution: 0 });
  }

  if (cloudsPct == null) {
    breakdown.push({ label: `Moln: — (ingen data) → molnfaktor=${cloudMult.toFixed(2)}`, contribution: 0 });
  } else {
    breakdown.push({ label: `Moln: ${Math.round(cloudsPct)}% → molnfaktor=${cloudMult.toFixed(2)}`, contribution: 0 });
  }

  breakdown.push({ label: `Måne: ${Math.round(moonIllumFrac*100)}% @ ${moonAltDeg.toFixed(1)}° → månfaktor=${moonMult.toFixed(2)}`, contribution: 0 });
  const bortle = Number(light?.bortle ?? light?.detail?.bortle ?? 0) || null;
  const cat = light?.category || light?.detail?.category || light?.source || '—';
  breakdown.push({ label: `Ljusförorening: ${cat}${bortle ? ` (B${bortle})` : ''} → ljusfaktor=${lightMult.toFixed(2)}`, contribution: 0 });

  return {
    algo: 'twilight-v1-suncalc',
    score,
    inputs: {
      cloudsPct: (cloudsPct == null ? null : Number(cloudsPct)),
      sunAltitude: sunAltDeg,
      moonAltitude: moonAltDeg,
      moonIllumination: moonIllumFrac,
      geomagneticScore: (geomLocal10 == null ? null : Number(geomLocal10))
    },
    breakdown
  };
}

export default { calculateSightabilityDetailed };
