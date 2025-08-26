// src/lib/astro/moon.js
import SunCalc from 'suncalc';

const rad2deg = (r) => (r == null ? null : (r * 180) / Math.PI);

/**
 * Normaliserad astro-data:
 *  - sunAltitude: grader
 *  - moonAltitude: grader
 *  - illumination: 0..1 (fraction)
 *  - phase: 0..1  (0=new, 0.5=full, 1=new)
 */
export function getMoonData(lat, lon, date = new Date()) {
  const sunPos = SunCalc.getPosition(date, lat, lon);        // altitude i rad
  const moonPos = SunCalc.getMoonPosition(date, lat, lon);   // altitude i rad
  const illum  = SunCalc.getMoonIllumination(date);          // { fraction, phase, angle }

  return {
    sunAltitude: rad2deg(sunPos?.altitude),
    moonAltitude: rad2deg(moonPos?.altitude),
    illumination: illum?.fraction ?? null,
    phase: illum?.phase ?? null,
    dateISO: date.toISOString(),
  };
}
