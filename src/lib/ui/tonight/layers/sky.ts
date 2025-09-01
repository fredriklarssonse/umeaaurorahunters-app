// src/lib/ui/tonight/layers/sky.ts
import type { TimelinePoint, Dims } from '../types';
import { isNum, mix, seededRandom, hourBandX } from './util';

// plockar twilight/moon parametrar
export function getSkyParams(p: TimelinePoint): { sunAlt?: number; moonAlt?: number; moonIllum?: number } {
  let sunAlt, moonAlt, moonIllum;
  const visArr = p?.breakdown?.visibility;
  if (Array.isArray(visArr)) {
    const tw = visArr.find((it) => it?.code === 'breakdown.twilight')?.params as any;
    if (tw && isNum(tw?.elevationDeg)) sunAlt = tw.elevationDeg;
    const moon = visArr.find((it) => it?.code === 'breakdown.moon')?.params as any;
    if (moon) {
      if (isNum(moon?.altDeg))  moonAlt = moon.altDeg;
      if (isNum(moon?.illum))   moonIllum = moon.illum;
    }
  }
  return { sunAlt, moonAlt, moonIllum };
}

export function darknessFromSun(sunAltDeg?: number): number {
  if (!isNum(sunAltDeg)) return 0.5;
  if (sunAltDeg >= -6)  return 0;
  if (sunAltDeg <= -18) return 1;
  return (-(sunAltDeg) - 6) / 12;
}

export function moonAttenuation(moonAltDeg?: number, moonIllum?: number): number {
  if (!isNum(moonAltDeg) || !isNum(moonIllum)) return 0;
  if (moonAltDeg <= 0) return 0;
  const altFactor = Math.min(1, moonAltDeg / 50);
  return Math.max(0, Math.min(1, moonIllum * altFactor));
}

// Stjärnor över hela höjden, fler upptill
function drawStarsGradient(
  ctx: CanvasRenderingContext2D,
  x0: number, x1: number, y0: number, y1: number,
  total: number, rnd: () => number
) {
  if (total <= 0) return;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';

  const bands = 6;
  const bandH = (y1 - y0) / bands;
  const weights = Array.from({ length: bands }, (_, bi) => {
    const t = bi / (bands - 1);  // 0 top..1 bottom
    return 1 - 0.7 * t;
  });
  const wSum = weights.reduce((a, b) => a + b, 0);
  let remaining = total;

  for (let bi = 0; bi < bands; bi++) {
    const share = Math.round((weights[bi] / wSum) * total);
    const count = (bi === bands - 1) ? remaining : Math.min(share, remaining);
    remaining -= count;

    const yy0 = y0 + bi * bandH;
    const yy1 = yy0 + bandH;

    for (let i = 0; i < count; i++) {
      const x = x0 + rnd() * (x1 - x0);
      const y = yy0 + rnd() * (yy1 - yy0);
      const r = 0.6 + rnd() * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawSkyBackground(ctx: CanvasRenderingContext2D, timeline: TimelinePoint[], xs: number[], dims: Dims) {
  const yTop = dims.pad.t;
  const yBot = dims.height - dims.pad.b;

  for (let i = 0; i < timeline.length; i++) {
    const { x0, x1 } = hourBandX(xs, i, dims);
    const p = timeline[i];
    const { sunAlt, moonAlt, moonIllum } = getSkyParams(p);
    const dark = darknessFromSun(sunAlt);
    const moonAtt = moonAttenuation(moonAlt, moonIllum);
    const darkEff = Math.max(0, dark * (1 - 0.7 * moonAtt));

    const dayRGB = [40, 48, 64];
    const nightRGB = [7, 10, 22];
    const t = darkEff;
    const r = Math.round(mix(dayRGB[0], nightRGB[0], t));
    const g = Math.round(mix(dayRGB[1], nightRGB[1], t));
    const b = Math.round(mix(dayRGB[2], nightRGB[2], t));

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x0, yTop, x1 - x0 + 1, yBot - yTop);

    // stjärnor efter mörker & måndämpning
    const seed = new Date(p.ts).getTime() >>> 0;
    const rnd = seededRandom(seed);
    const baseStars = 140;
    const starFactor = Math.max(0, dark * (1 - moonAtt * 0.9));
    const starCount = Math.round(baseStars * starFactor);
    drawStarsGradient(ctx, x0, x1, yTop, yBot, starCount, rnd);
  }
}

export function drawHourGridAndLabels(ctx: CanvasRenderingContext2D, timeline: TimelinePoint[], xs: number[], dims: Dims) {
  const labelY = dims.height - 7;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;

  for (let i = 0; i < xs.length; i++) {
    ctx.beginPath();
    ctx.moveTo(xs[i], dims.pad.t);
    ctx.lineTo(xs[i], dims.height - dims.pad.b);
    ctx.stroke();

    const hour = new Date(timeline[i].ts);
    const hh = hour.getHours().toString().padStart(2, '0');
    ctx.fillStyle = 'rgba(229,231,235,0.8)';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial';
    ctx.textAlign = (i === 0) ? 'left' : (i === xs.length - 1 ? 'right' : 'center');
    ctx.fillText(hh, xs[i], labelY);
  }
  ctx.restore();
}
