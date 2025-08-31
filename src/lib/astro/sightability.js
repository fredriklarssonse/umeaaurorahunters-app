// src/lib/astro/sightability.js
import SunCalc from 'suncalc';
import { CONFIG } from '../../config/app-config.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x ?? 0));
const deg = (rad) => rad * 180 / Math.PI;

/**
 * Beräkna synbarhet (0..10) + breakdown med kodade nycklar.
 * Params:
 *  - lat, lon: position
 *  - when: Date (UTC)
 *  - cloudsPct: 0..100 (kan vara null om saknas)
 *  - geomagneticScore: 0..10 (lokal/potential)
 *  - lightCategory: 'urban_core' | 'suburban' | 'rural' | 'unknown'
 *
 * Return:
 *  {
 *    algo: 'twilight-v1/suncalc',
 *    score: number(0..10),
 *    inputs: { cloudsPct, sunAltitude, moonAltitude, moonIllumination, geomagneticScore, lightCategory },
 *    breakdown: [{ code, params }]
 *  }
 */
export function calculateSightabilityDetailed({
  lat, lon, when,
  cloudsPct = null,
  geomagneticScore = 0,
  lightCategory = 'unknown'
}) {
  const breakdown = [];

  // --- Sol / Skymning (SunCalc)
  const sunPos = SunCalc.getPosition(when, lat, lon);
  const sunAltDeg = deg(sunPos.altitude);

  // Dämpning i skymning: mellan gate (-8°) och 0°,
  // med "allowance" så starkt norrsken kan skina igenom lite.
  const gate = CONFIG.sightability.sunGateDeg ?? -8;
  const twCfg = CONFIG.sightability.twilight || { fromDeg: -8, toDeg: 0, allowanceMax: 0.35 };

  let sunFactor = 1; // 1 = ingen dämpning (riktig natt)
  if (sunAltDeg >= 0) {
    sunFactor = 0;
    breakdown.push({
      code: 'breakdown.twilight.day',
      params: { sunAlt: +sunAltDeg.toFixed(1), factor: sunFactor }
    });
  } else if (sunAltDeg > gate) {
    // mellan -8 och 0
    const t = (sunAltDeg - gate) / (0 - gate);        // 0 vid -8, 1 vid 0
    const allowance = twCfg.allowanceMax ?? 0.35;     // max hur mycket som kan "slå igenom"
    sunFactor = allowance * (1 - t);                  //  ~0.35 vid -8°, ~0 vid 0°
    breakdown.push({
      code: 'breakdown.twilight.nautical',
      params: { sunAlt: +sunAltDeg.toFixed(1), factor: +sunFactor.toFixed(2) }
    });
  }
  // (vid < -8° lägger vi ingen twilight-rad – full natt)

  // --- Moln
  let cloudFactor = 1;
  if (typeof cloudsPct === 'number') {
    const c = clamp01(cloudsPct / 100);
    // enkel: klar himmel 1.0, heltäckande 0.0
    cloudFactor = 1 - c;
    breakdown.push({
      code: 'breakdown.clouds',
      params: { clouds: c, factor: +cloudFactor.toFixed(2) }
    });
  } else {
    // saknas data → anta neutralt och hoppa över rad (UI kan visa "ingen data" själv)
  }

  // --- Måne (SunCalc)
  const moonPos = SunCalc.getMoonPosition(when, lat, lon);
  const moonAltDeg = deg(moonPos.altitude);
  const moonIllum = SunCalc.getMoonIllumination(when).fraction; // 0..1

  let moonFactor = 1;
  if (moonAltDeg > 0) {
    const altK = clamp01(moonAltDeg / 60);            // skalning med höjd
    let pen = moonIllum * altK * 0.25;                // upp till ~25% dämpning
    // starkt norrsken påverkas mindre av månen
    const g = geomagneticScore || 0;
    const strengthScale = g <= 3 ? 1.0 : g >= 7 ? 0.35 : 0.6;
    pen *= strengthScale;
    moonFactor = clamp01(1 - pen);
  }
  breakdown.push({
    code: 'breakdown.moon',
    params: { illum: moonIllum, alt: +moonAltDeg.toFixed(1), factor: +moonFactor.toFixed(2) }
  });

  // --- Ljusförorening
  let lightFactor = 1;
  switch (lightCategory) {
    case 'urban_core': lightFactor = 0.85; break;
    case 'suburban':   lightFactor = 0.9;  break;
    case 'rural':      lightFactor = 1.0;  break;
    default:           lightFactor = 0.85; break; // unknown → konservativt
  }
  breakdown.push({
    code: 'breakdown.light',
    params: { category: lightCategory, factor: +lightFactor.toFixed(2) }
  });

  // --- Slutlig score (0..10)
  const base = clamp01((geomagneticScore ?? 0) / 10) * 10; // säkerställ 0..10
  const score = clamp01((base * sunFactor * cloudFactor * moonFactor * lightFactor) / 10) * 10;

  return {
    algo: 'twilight-v1/suncalc',
    score: +score.toFixed(2),
    inputs: {
      cloudsPct,
      sunAltitude: sunAltDeg,
      moonAltitude: moonAltDeg,
      moonIllumination: moonIllum,
      geomagneticScore: base,
      lightCategory
    },
    breakdown
  };
}
