<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { TimelinePoint, Dims } from './types';
  import { scaleX } from './layers/util';
  import { drawSkyBackground, drawHourGridAndLabels } from './layers/sky';
  import { drawCloudBands } from './layers/clouds';
  import { drawCurves } from './layers/curves';

  export let timeline: TimelinePoint[] = [];
  export let width = 980;
  export let height = 440;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let raf = 0;

  const PAD = { l: 24, r: 24, t: 16, b: 28 };

  function draw() {
    if (!ctx || !canvas) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    const n = timeline.length;
    if (n < 2) return;

    const dims: Dims = { width, height, pad: PAD };
    const xs = Array.from({ length: n }, (_, i) => scaleX(dims, n, i));

    // Ordning: himmel → rutnät → moln → kurvor
    drawSkyBackground(ctx, timeline, xs, dims);
    drawHourGridAndLabels(ctx, timeline, xs, dims);
    drawCloudBands(ctx, timeline, xs, dims);
    drawCurves(ctx, timeline, xs, dims);
  }

  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    schedule();
    const onResize = () => schedule();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  $: timeline, schedule();
  $: width, height, schedule();
  onDestroy(() => cancelAnimationFrame(raf));
</script>

<canvas bind:this={canvas}></canvas>

<style>
  :global(canvas) {
    display: block;
    width: 100%;
    border-radius: 12px;
  }
</style>
