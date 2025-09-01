// src/lib/ui/tonight/layers/clouds.ts
import type { TimelinePoint, Dims } from '../types';
import { clamp01, pathSmooth } from './util';

function getCloudParams(p: TimelinePoint): { low?: number; mid?: number; high?: number } {
  // Casta breakdown till any för att acceptera både "direct clouds" och via visibility[]
  const direct = (p as any)?.breakdown?.clouds as any;
  if (direct && (direct.low != null || direct.mid != null || direct.high != null)) {
    return {
      low: clamp01(direct.low),
      mid: clamp01(direct.mid),
      high: clamp01(direct.high),
    };
  }

  const visArr = (p as any)?.breakdown?.visibility as any[];
  if (Array.isArray(visArr)) {
    const clouds = visArr.find((it: any) => it?.code === 'breakdown.clouds')?.params;
    if (clouds) {
      return {
        low: clamp01(clouds.low),
        mid: clamp01(clouds.mid),
        high: clamp01(clouds.high),
      };
    }
  }
  return { low: 0, mid: 0, high: 0 };
}

function cloudZoneH(h: number) { return Math.min(140, Math.max(90, h * 0.24)); }
function cloudZone(dims: Dims) {
  const Hc = cloudZoneH(dims.height);
  const top = dims.pad.t + 8;
  const bottom = top + Hc;
  const center = top + Hc / 2;
  return { top, bottom, center, height: Hc };
}

// Centralt band från samma mittlinje (låg/mellan/hög)
function drawCenteredBand(
  ctx: CanvasRenderingContext2D,
  xs: number[],
  vals01: number[],
  centerY: number, zoneTop: number, zoneBottom: number,
  maxThickness: number, color: string,
  biasUp: number, biasDown: number
) {
  const n = xs.length;
  if (n < 2) return;
  if (vals01.every((v) => (v ?? 0) <= 0)) return;

  const ysTop: number[] = [];
  const ysBot: number[] = [];

  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, vals01[i] ?? 0));
    const thick = v * maxThickness;
    let top = centerY - thick * biasUp;
    let bot = centerY + thick * biasDown;
    if (top < zoneTop) top = zoneTop;
    if (bot > zoneBottom) bot = zoneBottom;
    ysTop.push(top);
    ysBot.push(bot);
  }

  ctx.beginPath();
  pathSmooth(ctx, xs, ysTop);
  const xsRev = [...xs].reverse();
  const ysRev = [...ysBot].reverse();
  pathSmooth(ctx, xsRev, ysRev);
  ctx.closePath();
  ctx.fillStyle = color; // tillräckligt opakt så stjärnor inte lyser igenom
  ctx.fill();
}

export function drawCloudBands(ctx: CanvasRenderingContext2D, timeline: TimelinePoint[], xs: number[], dims: Dims) {
  const cz = cloudZone(dims);

  const lows: number[] = [];
  const mids: number[] = [];
  const highs: number[] = [];
  for (const p of timeline) {
    const cp = getCloudParams(p);
    lows.push(clamp01(cp.low));
    mids.push(clamp01(cp.mid));
    highs.push(clamp01(cp.high));
  }

  const thickMax = cz.height * 0.90;
  const thickMid  = Math.min(34, thickMax * 0.60);
  const thickSide = Math.min(28, thickMax * 0.48);

  // Ordning: låg (ljus), hög (mörk), mellan överst
  drawCenteredBand(ctx, xs, lows,  cz.center, cz.top, cz.bottom, thickSide, 'rgba(225,230,235,0.42)', 0.30, 0.70);
  drawCenteredBand(ctx, xs, highs, cz.center, cz.top, cz.bottom, thickSide, 'rgba(125,135,145,0.45)', 0.70, 0.30);
  drawCenteredBand(ctx, xs, mids,  cz.center, cz.top, cz.bottom, thickMid,  'rgba(170,180,190,0.48)', 0.50, 0.50);
}
