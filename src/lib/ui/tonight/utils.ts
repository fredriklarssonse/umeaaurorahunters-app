export const Y_MAX = 10;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function midY(h: number, pad: Dims["pad"]) {
  // samma mittlinjeplacering som tidigare
  return pad.t + (h - pad.t - pad.b) * 0.18;
}

export function yVal(v: number, h: number, pad: Dims["pad"]) {
  const hh = h - pad.t - pad.b;
  const vv = Math.max(0, Math.min(Y_MAX, v));
  return pad.t + hh - (vv / Y_MAX) * hh;
}

export function xAt(index: number, n: number, dims: Dims) {
  const plotW = dims.width - dims.pad.l - dims.pad.r;
  const denom = Math.max(1, (n - 1) || 1);
  return dims.pad.l + (plotW * (index / denom));
}

// Catmull-Rom → kubiska segment för mjuka kurvor (som tidigare)
export function bezierSegments(xs: number[], ys: number[], steps = 16) {
  const out: number[] = [];
  const n = xs.length;
  if (n < 2) return out;

  const X = (i: number) => xs[Math.max(0, Math.min(n - 1, i))];
  const Y = (i: number) => ys[Math.max(0, Math.min(n - 1, i))];

  for (let i = 0; i < n - 1; i++) {
    const x0 = X(i - 1), y0 = Y(i - 1);
    const x1 = X(i),     y1 = Y(i);
    const x2 = X(i + 1), y2 = Y(i + 1);
    const x3 = X(i + 2), y3 = Y(i + 2);

    const cx1 = x1 + (x2 - x0) / 6;
    const cy1 = y1 + (y2 - y0) / 6;
    const cx2 = x2 - (x3 - x1) / 6;
    const cy2 = y2 - (y3 - y1) / 6;

    let px = x1, py = y1;
    for (let t = 1; t <= steps; t++) {
      const u = t / steps, uu = 1 - u;
      const x = uu * uu * uu * x1 + 3 * uu * uu * u * cx1 + 3 * uu * u * u * cx2 + u * u * u * x2;
      const y = uu * uu * uu * y1 + 3 * uu * uu * u * cy1 + 3 * uu * u * u * cy2 + u * u * u * y2;
      out.push(px, py, x, y);
      px = x; py = y;
    }
  }
  return out;
}

import type { Dims } from './types';
