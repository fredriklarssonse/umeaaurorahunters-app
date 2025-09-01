<script lang="ts">
  import MeteogramCanvas from '$lib/ui/tonight/MeteogramCanvas.svelte';

  export let data;
  let payload = data?.payload ?? null;

  // ---- Tuning ----
  const MIN_HOURS = 6;         // minst längd på kvällsfönstret
  const DARK_LIMIT = -6;       // solhöjd < -6° = mörkt
  const EVE_HOUR = 18;         // fallback kvällstart
  const MORN_HOUR = 6;         // fallback morgonslut

  // --- Hjälpfunktioner ---
  const tsNum = (p:any) => new Date(p.ts).getTime();

  function sunAlt(p:any): number|null {
    const arr = p?.breakdown?.visibility;
    if (!Array.isArray(arr)) return null;
    const tw = arr.find((x:any) => x?.code === 'breakdown.twilight')?.params;
    return (tw && typeof tw.elevationDeg === 'number') ? tw.elevationDeg : null;
  }

  function contiguousBlocks(flags: boolean[]) {
    const out: Array<{s:number; e:number}> = [];
    let s = -1;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i]) { if (s === -1) s = i; }
      else { if (s !== -1) { out.push({s, e:i-1}); s = -1; } }
    }
    if (s !== -1) out.push({ s, e: flags.length - 1 });
    return out;
  }

  // "Nästa i framtiden" block: justera starttid med +1 dygn om den ligger före "nu"
  function pickNextForwardBlock(blocks: Array<{s:number; e:number}>, items: any[]) {
    if (!blocks.length) return null;
    const now = Date.now();
    let best: {s:number; e:number} | null = null;
    let bestAdj = Infinity;

    for (const b of blocks) {
      const start = tsNum(items[b.s]);
      const adj = start < now ? start + 86400000 : start; // rulla till "nästa dygn"
      if (adj < bestAdj) { bestAdj = adj; best = b; }
    }
    return best!;
  }

  function extendMinHours(block: {s:number; e:number}, n: number) {
    let { s, e } = block;
    const need = Math.max(0, MIN_HOURS - (e - s + 1));
    let left = Math.ceil(need/2), right = need - left;
    while (left > 0 && s > 0) { s--; left--; }
    while (right > 0 && e < n-1) { e++; right--; }
    while (left > 0 && s > 0) { s--; left--; }
    while (right > 0 && e < n-1) { e++; right--; }
    return { s, e };
  }

  function isEveningHourLocal(d: Date) {
    const h = d.getHours();
    return h >= EVE_HOUR || h <= MORN_HOUR;
  }

  function buildEveningWindow(tl: any[]) {
    if (!Array.isArray(tl) || tl.length === 0) return tl;

    // 1) Primär: solhöjd
    const darkFlags = tl.map((p) => {
      const a = sunAlt(p);
      return a === null ? false : a < DARK_LIMIT;
    });

    if (darkFlags.some(Boolean)) {
      const blocks = contiguousBlocks(darkFlags);
      const chosen = pickNextForwardBlock(blocks, tl);
      const grown = extendMinHours(chosen!, tl.length);
      return tl.slice(grown.s, grown.e + 1);
    }

    // 2) Fallback: kvällstider
    const eveFlags = tl.map((p) => isEveningHourLocal(new Date(p.ts)));
    if (eveFlags.some(Boolean)) {
      const blocks = contiguousBlocks(eveFlags);
      const chosen = pickNextForwardBlock(blocks, tl);
      const grown = extendMinHours(chosen!, tl.length);
      return tl.slice(grown.s, grown.e + 1);
    }

    // 3) Sista utväg: ta 6h närmast nu framåt (med dygnsrull)
    const now = Date.now();
    let bestIdx = 0, bestAdj = Infinity;
    for (let i = 0; i < tl.length; i++) {
      const start = tsNum(tl[i]);
      const adj = start < now ? start + 86400000 : start;
      if (adj < bestAdj) { bestAdj = adj; bestIdx = i; }
    }
    let s = bestIdx, e = Math.min(tl.length - 1, s + MIN_HOURS - 1);
    if (e - s + 1 < MIN_HOURS) s = Math.max(0, e - MIN_HOURS + 1);
    return tl.slice(s, e + 1);
  }

  $: filtered = payload?.timeline ? buildEveningWindow(payload.timeline) : [];

  $: place = payload?.location?.name ?? '—';
  $: lat = payload?.location?.lat;
  $: lon = payload?.location?.lon;

  const hh = (d:Date) => d.toLocaleTimeString([], { hour:'2-digit' });
</script>

<svelte:head><title>Ikväll</title></svelte:head>

{#if payload}
  <h2 style="margin:0 0 8px 0;">Ikväll</h2>
  <div style="opacity:.8; font-size:14px; margin-bottom:8px;">
    Plats: {place} · Lat/Lon: {lat}, {lon}
  </div>

  {#if filtered.length >= 2}
    <MeteogramCanvas timeline={filtered} width={980} height={440} />

    <!-- Debug: vilka timmar blev det? (ta bort när klart) -->
    <details style="margin-top:8px; opacity:.8;">
      <summary>Valda timmar</summary>
      <div style="font-size:13px; display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
        {#each filtered as p}
          <span style="padding:2px 6px; border:1px solid #334155; border-radius:8px;">
            {hh(new Date(p.ts))}
          </span>
        {/each}
      </div>
    </details>
  {:else}
    <div class="ui-card" style="padding:12px;">Ingen kväll att visa.</div>
  {/if}
{:else}
  <div class="ui-card" style="padding:12px;">Laddar …</div>
{/if}
