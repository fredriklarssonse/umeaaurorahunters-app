<script>
  import uPlot from 'uplot';
  import { onMount, onDestroy } from 'svelte';

  export let timeline = [];
  export let observed = [];

  let el;           // container
  let plot;         // uPlot instance
  let resizeObs;
  let tooltipEl;

  const asNum = (x, d = 0) => (x ?? x === 0) ? +x : d;

  function getCloud(p, key) {
    const clouds = (p?.breakdown?.visibility || []).find(b => b.code === 'breakdown.clouds');
    const v = clouds?.params?.[key];
    return typeof v === 'number' ? v : 0;
  }

  // --- data arrays ---
  const xs  = timeline.map(p => new Date(p.ts).getTime() / 1000);
  const pot = timeline.map(p => asNum(p.potential));   // 0..10
  const vis = timeline.map(p => asNum(p.visibility));  // 0..10

  const clLow  = timeline.map(p => getCloud(p, 'low'));   // 0..1
  const clMid  = timeline.map(p => getCloud(p, 'mid'));
  const clHigh = timeline.map(p => getCloud(p, 'high'));

  // observed → samma längd som xs (nulls om saknas)
  const obsArr = xs.map(() => null);

  // --- helpers ---
  const fmtClock = (sec) => {
    const d = new Date(sec * 1000);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  // Catmull-Rom → bezier, och valfri “fyll till y”
  function smoothPath(ctx, xs, ys, toY, valToPosX, valToPosY) {
    const pts = [];
    for (let i = 0; i < xs.length; i++) {
      pts.push([valToPosX(xs[i]), valToPosY(ys[i] ?? 0)]);
    }
    if (pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
    }
    if (toY != null) {
      ctx.lineTo(pts.at(-1)[0], toY);
      ctx.lineTo(pts[0][0], toY);
      ctx.closePath();
    }
  }

  function ensureTooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'tonight-tooltip';
      tooltipEl.style.position = 'absolute';
      tooltipEl.style.pointerEvents = 'none';
      tooltipEl.style.transform = 'translate(-9999px,-9999px)';
      el.appendChild(tooltipEl);
    }
  }

  onMount(() => {
    const data = [ xs, pot, vis, obsArr ];

    const opts = {
      width: 100,
      height: 260,
      legend: { show: false },
      scales: {
        x: { time: false },
        y: { range: [0, 10] },
      },
      axes: [
        {
          grid: { show: true, stroke: 'rgba(148,163,184,0.15)' },
          ticks: { show: true, stroke: 'rgba(148,163,184,0.35)' },
          values: (u, splits) => splits.map(fmtClock),
          stroke: 'rgba(229,231,235,.9)',
        },
        {
          grid: { show: true, stroke: 'rgba(148,163,184,0.15)' },
          ticks: { show: true, stroke: 'rgba(148,163,184,0.35)' },
          stroke: 'rgba(229,231,235,.9)',
        },
      ],
      series: [
        {},
        {
          label: 'Potential',
          width: 2,
          stroke: 'rgba(34,197,94,1)',
          fill: 'rgba(34,197,94,0.10)',   // diskret fill (gradienten ritas separat)
          paths: uPlot.paths.spline(),
        },
        {
          label: 'Visibility',
          width: 2,
          stroke: 'rgba(59,130,246,1)',
          fill: 'rgba(59,130,246,0.08)',
          paths: uPlot.paths.spline(),
        },
        {
          label: 'Observed',
          width: 2,
          stroke: 'rgba(249,115,22,1)',
          points: { show: false },
          paths: uPlot.paths.spline(),
        },
      ],
      hooks: {
        // 1) Ritas först – under serierna
        drawClear: [
          (u) => {
            const { left, top, width, height } = u.bbox;
            const ctx = u.ctx;

            // bakgrund
            ctx.save();
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#0b1020';
            ctx.fillRect(left, top, width, height);

            // clip till ritytan
            ctx.beginPath();
            ctx.rect(left, top, width, height);
            ctx.clip();

            // potential-gradient under pot-kurvan
            if (xs.length > 1) {
              const sX = (x) => u.valToPos(x, 'x', true);
              const sY = (y) => u.valToPos(y, 'y', true);

              const grd = ctx.createLinearGradient(0, sY(10), 0, sY(0));
              grd.addColorStop(0.00, 'rgba(34,197,94,0.00)');
              grd.addColorStop(0.30, 'rgba(34,197,94,0.08)');
              grd.addColorStop(0.60, 'rgba(34,197,94,0.14)');
              grd.addColorStop(1.00, 'rgba(34,197,94,0.22)');

              ctx.fillStyle = grd;
              smoothPath(ctx, xs, pot, sY(0), sX, sY);
              ctx.fill();
            }
            ctx.restore();
          }
        ],
        // 2) Ritas sist – ovanpå serier/axlar
        draw: [
          (u) => {
            if (xs.length < 2) return;
            const { left, top, width, height } = u.bbox;
            const ctx = u.ctx;

            ctx.save();
            // clip exakt till ritytan
            ctx.beginPath();
            ctx.rect(left, top, width, height);
            ctx.clip();

            const sX = (x) => u.valToPos(x, 'x', true);
            const sY = (y) => u.valToPos(y, 'y', true);
            const yTop = sY(10);
            const toSpan = (f) => 10 * Math.max(0, Math.min(1, f)); // 0..1 → 0..10

            // High, Mid, Low – stapla uppifrån (metogram-känsla)
            ctx.globalAlpha = 1;

            ctx.fillStyle = 'rgba(148,163,184,0.50)'; // high mörkast
            smoothPath(ctx, xs, clHigh.map(f => 10 - toSpan(f)), yTop, sX, sY);
            ctx.fill();

            ctx.fillStyle = 'rgba(203,213,225,0.40)'; // mid
            smoothPath(ctx, xs, clMid.map(f => 10 - toSpan(f)), yTop, sX, sY);
            ctx.fill();

            ctx.fillStyle = 'rgba(241,245,249,0.30)'; // low ljusast
            smoothPath(ctx, xs, clLow.map(f => 10 - toSpan(f)), yTop, sX, sY);
            ctx.fill();

            // subtil topp-linje
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            ctx.moveTo(left, yTop + 0.5);
            ctx.lineTo(left + width, yTop + 0.5);
            ctx.stroke();

            ctx.restore();
          }
        ],
        ready: [
          (u) => {
            ensureTooltip();
          }
        ],
      },
      cursor: {
        y: false,
        bind: {
          mousemove: (u, targ, handler) => (e) => {
            handler(e);
            ensureTooltip();
            const idx = u.cursor.idx;
            if (idx == null || idx < 0 || idx >= xs.length) {
              tooltipEl.style.transform = 'translate(-9999px,-9999px)';
              return;
            }
            const xPos = u.valToPos(xs[idx], 'x', true);
            const yPos = u.valToPos(pot[idx], 'y', true);
            tooltipEl.innerHTML = `
              <div><b>${fmtClock(xs[idx])}</b></div>
              <div>ui.now.potential: ${pot[idx]?.toFixed(1)}</div>
              <div>ui.now.visibility: ${vis[idx]?.toFixed(1)}</div>
            `;
            tooltipEl.style.transform = `translate(${Math.round(xPos + 10)}px, ${Math.round(yPos - 10)}px)`;
          },
          mouseleave: (u, targ, handler) => (e) => {
            handler(e);
            tooltipEl && (tooltipEl.style.transform = 'translate(-9999px,-9999px)');
          }
        }
      },
    };

    plot = new uPlot(opts, data, el);

    // auto-resize
    resizeObs = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      plot.setSize({ width: Math.max(320, rect.width | 0), height: 260 });
    });
    resizeObs.observe(el);

    const rect = el.getBoundingClientRect();
    plot.setSize({ width: Math.max(320, rect.width | 0), height: 260 });
  });

  onDestroy(() => {
    resizeObs?.disconnect();
    plot?.destroy();
  });
</script>

<div class="uplot-container" bind:this={el} style="width:100%;"></div>

<style>
  .tonight-tooltip{
    position:absolute; pointer-events:none;
    background:rgba(17,24,39,.95); color:#e5e7eb;
    font-size:12px; padding:6px 8px; border:1px solid #334155; border-radius:6px;
    transform:translate(-9999px,-9999px); white-space:nowrap; z-index:6;
  }
  .u-legend, .u-axis, .u-values { color: var(--text); }
</style>
