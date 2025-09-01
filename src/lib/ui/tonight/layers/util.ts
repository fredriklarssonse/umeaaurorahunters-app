// Gemensamma typer & hjälpare för tonight-lagren

// Re-export så befintliga imports från './util' fortsätter fungera
export type { TimelinePoint, Dims } from './types';

export const PAD = { l: 24, r: 24, t: 16, b: 28 };

export const isNum = (x: any) => typeof x === 'number' && isFinite(x);

export function clamp01(x: any) {
  if (!isNum(x)) return 0;
  // Tillåt procent 0..100
  if (x > 1 && x <= 100) return Math.max(0, Math.min(1, x / 100));
  return Math.max(0, Math.min(1, x));
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function pathSmooth(ctx: CanvasRenderingContext2D, xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return;
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 0; i < n - 1; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2;
    const my = (ys[i] + ys[i + 1]) / 2;
    ctx.quadraticCurveTo(xs[i], ys[i], mx, my);
  }
  ctx.lineTo(xs[n - 1], ys[n - 1]);
}

export function scaleX(w: number, n: number, i: number) {
  const left = PAD.l, right = w - PAD.r;
  if (n <= 1) return left;
  return left + (i * (right - left)) / (n - 1);
}

// ————— Moln-zon nära toppen —————
export function cloudZoneH(h: number) {
  return Math.min(140, Math.max(90, h * 0.24));
}
export function cloudZone(h: number) {
  const Hc = cloudZoneH(h);
  const top = PAD.t + 8;
  const bottom = top + Hc;
  const center = top + Hc / 2;
  return { top, bottom, height: Hc, center };
}

// ————— Värden under molnlagren (t.ex. siktscore 0..10) —————
export function yBelowClouds(h: number, v0to10: number) {
  const cz = cloudZone(h);
  const minY = cz.bottom + 20;
  const maxY = h - PAD.b;
  const v = Math.max(0, Math.min(10, v0to10));
  return maxY - (v / 10) * (maxY - minY);
}

// ————— X-område per timme (för bakgrundsband och stjärnor) —————
export function hourBandX(xs: number[], i: number, w: number) {
  const leftEdge = PAD.l, rightEdge = w - PAD.r;
  const mPrev = i === 0 ? leftEdge : (xs[i - 1] + xs[i]) / 2;
  const mNext = i === xs.length - 1 ? rightEdge : (xs[i] + xs[i + 1]) / 2;
  return { x0: mPrev, x1: mNext };
}

// ————— Deterministiskt slumptal (för stjärnprickar) —————
export function seededRandom(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ————— Plocka sol/måne-data —————
export function getSkyParams(p: any): { sunAlt?: number; moonAlt?: number; moonIllum?: number } {
  let sunAlt, moonAlt, moonIllum;
  const visArr = p?.breakdown?.visibility;
  if (Array.isArray(visArr)) {
    const tw = visArr.find((it: any) => it?.code === 'breakdown.twilight')?.params;
    if (tw && isNum(tw.elevationDeg)) sunAlt = tw.elevationDeg;
    const moon = visArr.find((it: any) => it?.code === 'breakdown.moon')?.params;
    if (moon) {
      if (isNum(moon.altDeg)) moonAlt = moon.altDeg;
      if (isNum(moon.illum))  moonIllum = moon.illum;
    }
  }
  return { sunAlt, moonAlt, moonIllum };
}

export function darknessFromSun(sunAltDeg?: number): number {
  if (!isNum(sunAltDeg)) return 0.5;
  if (sunAltDeg >= -6)  return 0;   // för ljust
  if (sunAltDeg <= -18) return 1;   // astro-natt
  return (-(sunAltDeg) - 6) / 12;
}

export function moonAttenuation(moonAltDeg?: number, moonIllum?: number): number {
  if (!isNum(moonAltDeg) || !isNum(moonIllum)) return 0;
  if (moonAltDeg <= 0) return 0;
  const altFactor = Math.min(1, moonAltDeg / 50);
  const illum = clamp01(moonIllum);
  return Math.max(0, Math.min(1, illum * altFactor));
}

// ————— Plocka molnvärden (direkt eller via breakdown.visibility) —————
export function getCloudParams(p: any): { low?: number; mid?: number; high?: number } | null {
  const direct = (p?.breakdown as any)?.clouds;
  if (direct && (isNum(direct.low) || isNum(direct.mid) || isNum(direct.high))) return direct;

  const visArr = p?.breakdown?.visibility;
  if (Array.isArray(visArr)) {
    const clouds = visArr.find((it: any) => it?.code === 'breakdown.clouds')?.params;
    if (clouds && (isNum(clouds.low) || isNum(clouds.mid) || isNum(clouds.high))) return clouds;
  }
  return null;
}
