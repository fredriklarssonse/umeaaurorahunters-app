// src/lib/ui/tonight/layers/curves.ts
import type { TimelinePoint, Dims } from '../types';
import { isNum, pathSmooth } from './util';

function cloudZoneH(h: number) { return Math.min(140, Math.max(90, h * 0.24)); }
function cloudZone(dims: Dims) {
  const Hc = cloudZoneH(dims.height);
  const top = dims.pad.t + 8;
  const bottom = top + Hc;
  return { bottom };
}

function yForValueBelowClouds(dims: Dims, v0to10: number) {
  const cz = cloudZone(dims);
  const minY = cz.bottom + 20;
  const maxY = dims.height - dims.pad.b;
  const v = Math.max(0, Math.min(10, v0to10));
  return maxY - (v / 10) * (maxY - minY);
}

export function drawCurves(ctx: CanvasRenderingContext2D, timeline: TimelinePoint[], xs: number[], dims: Dims) {
  const potentials  = timeline.map((p) => (isNum(p?.potential)  ? (p as any).potential  : 0));
  const visibilities = timeline.map((p) => (isNum(p?.visibility) ? (p as any).visibility : 0));
  const ysPot = potentials.map((v) => yForValueBelowClouds(dims, v));
  const ysVis = visibilities.map((v) => yForValueBelowClouds(dims, v));

  ctx.lineWidth = 6;
  ctx.strokeStyle = '#2dd4bf'; // grön
  ctx.beginPath(); pathSmooth(ctx, xs, ysPot); ctx.stroke();

  ctx.lineWidth = 7;
  ctx.strokeStyle = '#93b4ff'; // blå
  ctx.beginPath(); pathSmooth(ctx, xs, ysVis); ctx.stroke();
}
