<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { TimelinePoint } from './utils';
  import { mapDbRowsToTimeline } from './utils';
  import { drawSkyBase } from './layers/sky';

  export let rowsFromDb: any[] = []; // <-- props: rows från RPC bundle (data.rows)
  let timeline: TimelinePoint[] = [];

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let ro: ResizeObserver | null = null;

  function render() {
    if (!ctx) return;
    const { width, height } = host.getBoundingClientRect();
    // hiDPI – enkel
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Baslager: tidslinje + plattor + stjärnor
    drawSkyBase(ctx, timeline, Math.max(1, width), Math.max(1, height), {
      showStars: true,
      axisHeight: 24,
    });
  }

  $: (timeline = mapDbRowsToTimeline(rowsFromDb), render());

  onMount(() => {
    ctx = canvas.getContext('2d');
    ro = new ResizeObserver(render);
    ro.observe(host);
    render();
  });

  onDestroy(() => ro?.disconnect());
</script>

<div bind:this={host} class="w-full h-60 relative">
  <canvas bind:this={canvas} class="block w-full h-full"></canvas>
</div>
