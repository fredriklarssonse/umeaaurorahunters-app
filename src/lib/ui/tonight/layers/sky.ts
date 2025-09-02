// --- src/lib/ui/tonight/layers/sky.ts --------------------------------


import type { TimelinePoint } from './types';    // <— ändra till ./types
import { twilightAlpha } from './utils';        // denna ska finnas kvar

// Hämta twilight-nyckel om den finns i breakdown
function getTwilightKey(p: TimelinePoint): string | null {
  const b = p.breakdown?.visibility ?? [];
  const tw = b.find(x => x.code === 'breakdown.twilight');
  return (tw?.params as any)?.key ?? null;
}

// Hämta hour label (om ni redan beräknar den tidigare i pipen; annars "HH:mm")
function hourLabelFromTs(ts: string): string {
  return ts.slice(11, 16); // "YYYY-MM-DD HH:mm:ss" -> "HH:mm"
}

// Baslager: rita plattor med opacity från twilight + stjärnor efter mörkergrad
export function drawSkyBase(
  ctx: CanvasRenderingContext2D,
  timeline: TimelinePoint[],
  width: number,
  height: number,
  opts: { showStars?: boolean; axisHeight?: number } = {}
) {
  if (!timeline.length) return;

  const axisH = Math.max(20, opts.axisHeight ?? 24);
  const plotH = height - axisH;
  const colW = width / timeline.length;

  // 1) Bakgrundsplattor
  for (let i = 0; i < timeline.length; i++) {
    const key = getTwilightKey(timeline[i]);
    const alpha = twilightAlpha(key as any);
    if (alpha <= 0) continue;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000000'; // faktisk färg/tema sätts i appen via compositing
    ctx.fillRect(Math.floor(i * colW), 0, Math.ceil(colW) + 1, plotH);
  }
  ctx.globalAlpha = 1;

  // 2) Stjärnor (fler ju mörkare). Enkel PRNG för determinism utan lib.
  if (opts.showStars !== false) {
    function rand(seed: number) {
      let t = seed + 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    for (let i = 0; i < timeline.length; i++) {
      const key = getTwilightKey(timeline[i]) as any;
      const a = twilightAlpha(key);
      // normalisera 0.25..0.95 -> 0..1 för densitet
      const density = Math.max(0, Math.min(1, (a - 0.25) / (0.95 - 0.25)));
      const maxStarsPerCol = 40;
      const n = Math.floor(density * maxStarsPerCol);

      for (let s = 0; s < n; s++) {
        const seed = i * 8191 + s * 131;
        const rx = rand(seed);
        const ry = rand(seed + 1);
        const rsz = rand(seed + 2);
        const x = i * colW + rx * colW;
        const y = ry * (plotH - 2) + 1;
        const size = 0.5 + rsz * 1.5;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  // 3) Tidsaxel (HH:mm) + ticks
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;

  const axisTop = plotH + 0.5;
  ctx.beginPath();
  ctx.moveTo(0, axisTop);
  ctx.lineTo(width, axisTop);
  ctx.stroke();

  ctx.globalAlpha = 0.9;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const tickEvery = Math.max(1, Math.floor(timeline.length / 10)); // ungefär 8–12 etiketter
  for (let i = 0; i < timeline.length; i++) {
    if (i % tickEvery !== 0) continue;
    const cx = i * colW + colW / 2;

    // tick
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(Math.round(i * colW) + 0.5, plotH);
    ctx.lineTo(Math.round(i * colW) + 0.5, plotH + 4);
    ctx.stroke();

    // text
    ctx.globalAlpha = 0.9;
    const label = hourLabelFromTs(timeline[i].ts);
    ctx.fillText(label, cx, plotH + 6);
  }

  ctx.restore();
}
