import type { TimelinePoint, Dims } from '../types';
import { yVal, bezierSegments, xAt } from '../utils';

export function drawSeries(
  ctx: CanvasRenderingContext2D,
  timeline: TimelinePoint[],
  dims: Dims,
  colors = { aurora: '#34d399', visibility: '#97b5ff' }
) {
  const n = timeline.length;
  if (n < 2) return;

  const xs: number[] = [], ya: number[] = [], yv: number[] = [];
  for (let i = 0; i < n; i++) {
    xs.push(xAt(i, n, dims));
    ya.push(yVal(timeline[i].potential ?? 0, dims.height, dims.pad));
    yv.push(yVal(timeline[i].visibility ?? 0, dims.height, dims.pad));
  }

  // visibility (blå)
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = colors.visibility;
  const vSeg = bezierSegments(xs, yv, 16);
  ctx.beginPath(); ctx.moveTo(xs[0], yv[0]);
  for (let i = 0; i < vSeg.length; i += 4) ctx.lineTo(vSeg[i + 2], vSeg[i + 3]);
  ctx.stroke(); ctx.restore();

  // aurora (grön)
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = colors.aurora;
  const aSeg = bezierSegments(xs, ya, 16);
  ctx.beginPath(); ctx.moveTo(xs[0], ya[0]);
  for (let i = 0; i < aSeg.length; i += 4) ctx.lineTo(aSeg[i + 2], aSeg[i + 3]);
  ctx.stroke(); ctx.restore();
}
