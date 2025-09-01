import type { TimelinePoint, Dims } from '../types';
import { xAt } from '../utils';

export function drawGridAndHours(
  ctx: CanvasRenderingContext2D,
  timeline: TimelinePoint[],
  dims: Dims
) {
  const n = timeline.length;
  const plotW = dims.width - dims.pad.l - dims.pad.r;
  const plotH = dims.height - dims.pad.t - dims.pad.b;

  // horisontella
  ctx.strokeStyle = '#2a3443';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i <= 5; i++) {
    const y = dims.pad.t + (plotH / 5) * i;
    ctx.beginPath(); ctx.moveTo(dims.pad.l, y); ctx.lineTo(dims.pad.l + plotW, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // vertikala + tid
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.font = '12px system-ui, Arial';
  ctx.fillStyle = 'rgba(229,231,235,.8)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let i = 0; i < n; i++) {
    const x = xAt(i, n, dims);
    ctx.beginPath(); ctx.moveTo(x, dims.pad.t); ctx.lineTo(x, dims.pad.t + plotH); ctx.stroke();

    const d = new Date(timeline[i].ts);
    if (i === 0 || i === n - 1 || d.getMinutes() === 0) {
      ctx.fillText(d.toLocaleTimeString([], { hour: '2-digit' }), x, dims.pad.t + plotH + 10);
    }
  }
}
