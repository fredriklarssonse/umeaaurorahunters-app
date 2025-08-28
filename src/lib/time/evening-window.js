// src/lib/time/evening-window.js
// Beräkna "kvällens" observationsfönster med SunCalc (nautical dusk → nautical dawn)
import SunCalcMod from 'suncalc';
const SunCalc = (SunCalcMod && SunCalcMod.getTimes) ? SunCalcMod
  : (SunCalcMod?.default?.getTimes ? SunCalcMod.default : SunCalcMod);

function atLocal(d, h = 0, m = 0, s = 0) {
  const x = new Date(d);
  x.setHours(h, m, s, 0);
  return x;
}
function safeTime(t, fallback) { return (t instanceof Date && !isNaN(t)) ? t : fallback; }

export function computeEveningWindow(lat, lon, when = new Date(), dayOffset = 0) {
  const base = new Date(when);
  base.setDate(base.getDate() + dayOffset);

  const t0 = SunCalc.getTimes(base, lat, lon);
  const t1 = SunCalc.getTimes(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1), lat, lon);

  // Start = nautisk skymning (alt: civil skymning → solnedgång)
  const start =
    safeTime(t0.nauticalDusk, null) ||
    safeTime(t0.dusk, null) ||
    safeTime(t0.sunset, atLocal(base, 22, 0));

  // Slut = nautisk gryning (alt: civil/soluppgång)
  const end =
    safeTime(t1.nauticalDawn, null) ||
    safeTime(t1.dawn, null) ||
    safeTime(t1.sunrise, atLocal(base, 2, 0));

  // Om tider saknas (extrema latituder) – använd 22–02 lokalt
  const startFinal = start ?? atLocal(base, 22, 0);
  const endFinal   = end   ?? atLocal(base, 2, 0);

  // Säkerställ att end ligger efter start (lägg på ett dygn om behövs)
  if (endFinal <= startFinal) endFinal.setDate(endFinal.getDate() + 1);

  return { start: startFinal, end: endFinal };
}
