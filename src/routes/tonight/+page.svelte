<script lang="ts">
  import MeteogramCanvas from '$lib/ui/tonight/MeteogramCanvas.svelte';

  // Data från load()
  export let data: any;
  let payload = data?.payload ?? null;

  // ---- Tuning ----
  const MIN_HOURS = 6;         // minst längd på kvällsfönstret
  const DARK_LIMIT = -6;       // solhöjd < -6° = mörkt
  const EVE_HOUR = 18;         // fallback kvällstart
  const MORN_HOUR = 6;         // fallback morgonslut

  // ---- Helpers ----
  const tsNum = (p: any) => new Date((p.ts as string).replace(' ', 'T')).getTime();
  const toMs  = (s?: string | null) => s ? new Date(s.replace(' ', 'T')).getTime() : NaN;

  function sunAlt(p: any): number | null {
    const arr = p?.breakdown?.visibility;
    if (!Array.isArray(arr)) return null;
    const tw = arr.find((x: any) => x?.code === 'breakdown.twilight')?.params ?? null;
    if (!tw) return null;
    if (typeof tw.elevationDeg === 'number') return tw.elevationDeg;

    // fallback från twilight-nyckel (syntetiskt mittvärde per fas)
    switch (tw.key) {
      case 'astronomy.twilight.civil':        return -3;
      case 'astronomy.twilight.nautical':     return -9;
      case 'astronomy.twilight.astronomical': return -15;
      case 'astronomy.twilight.astro_dark':   return -19;
      default: return null;
    }
  }

  function contiguousBlocks(flags: boolean[]) {
    const out: Array<{ s: number; e: number }> = [];
    let s = -1;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i]) { if (s === -1) s = i; }
      else { if (s !== -1) { out.push({ s, e: i - 1 }); s = -1; } }
    }
    if (s !== -1) out.push({ s, e: flags.length - 1 });
    return out;
  }

  function pickBestBlock(blocks: Array<{ s: number; e: number }>, items: any[]) {
    if (!blocks.length) return null;
    const now = Date.now();

    let future: Array<{ b: { s: number; e: number }; dist: number }> = [];
    let past: Array<{ b: { s: number; e: number }; end: number }> = [];

    for (const b of blocks) {
      const t0 = tsNum(items[b.s]);
      const t1 = tsNum(items[b.e]);
      const mid = (t0 + t1) / 2;
      if (mid >= now) future.push({ b, dist: mid - now });
      else past.push({ b, end: t1 });
    }

    if (future.length) {
      future.sort((a, b) => a.dist - b.dist);
      return future[0].b;
    }
    past.sort((a, b) => b.end - a.end);
    return past[0].b;
  }

  function extendMinHours(block: { s: number; e: number }, n: number) {
    let { s, e } = block;
    const need = Math.max(0, MIN_HOURS - (e - s + 1));
    let left = Math.ceil(need / 2), right = need - left;

    while (left > 0 && s > 0)      { s--; left--; }
    while (right > 0 && e < n - 1) { e++; right--; }
    while (left > 0 && s > 0)      { s--; left--; }
    while (right > 0 && e < n - 1) { e++; right--; }

    s = Math.max(0, Math.min(s, n - 1));
    e = Math.max(s, Math.min(e, n - 1));
    return { s, e };
  }

  function isEveningHourLocal(d: Date) {
    const h = d.getHours();
    return h >= EVE_HOUR || h <= MORN_HOUR;
  }

  // Fallback-byggare (om serverfönster saknas/inte klipper något)
  function buildEveningWindow(tl: any[]) {
    if (!Array.isArray(tl) || tl.length === 0) return tl;

    // 1) Primär: solhöjd
    const darkFlags = tl.map((p) => {
      const a = sunAlt(p);
      return a === null ? false : a < DARK_LIMIT;
    });

    if (darkFlags.some(Boolean)) {
      const blocks = contiguousBlocks(darkFlags);
      const chosen = pickBestBlock(blocks, tl);
      const grown = extendMinHours(chosen!, tl.length);
      return tl.slice(grown.s, grown.e + 1);
    }

    // 2) Fallback: kvällstider
    const eveFlags = tl.map((p) => isEveningHourLocal(new Date((p.ts as string).replace(' ', 'T'))));
    if (eveFlags.some(Boolean)) {
      const blocks = contiguousBlocks(eveFlags);
      const chosen = pickBestBlock(blocks, tl);
      const grown = extendMinHours(chosen!, tl.length);
      return tl.slice(grown.s, grown.e + 1);
    }

    // 3) Sista utväg: 6h närmast nu (straffa bakåttid)
    const now = Date.now();
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < tl.length; i++) {
      const t = tsNum(tl[i]);
      const dist = t >= now ? (t - now) : (now - t) + 1e12;
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    let s = bestIdx, e = Math.min(tl.length - 1, s + MIN_HOURS - 1);
    if (e - s + 1 < MIN_HOURS) s = Math.max(0, e - MIN_HOURS + 1);
    return tl.slice(s, e + 1);
  }

  // Klipp timeline mot serverfönster [from,to)
  function clipByWindow(tl: any[], fromIso?: string | null, toIso?: string | null) {
    const from = toMs(fromIso);
    const to   = toMs(toIso);
    if (!isFinite(from) || !isFinite(to)) return null;
    const out = tl.filter(p => {
      const t = toMs(p.ts);
      return isFinite(t) && t >= from && t < to;
    });
    return out.length ? out : null;
  }

  // Expandera klippt fönster till minst 6h (inom gränserna)
  function expandToMinHours(slice: any[], tl: any[]) {
    if (!slice.length) return slice;
    if (slice.length >= MIN_HOURS) return slice;

    const firstTs = slice[0].ts, lastTs = slice[slice.length - 1].ts;
    const s = tl.findIndex(p => p.ts === firstTs);
    const e = tl.findIndex(p => p.ts === lastTs);
    if (s < 0 || e < 0) return slice;

    const need = MIN_HOURS - slice.length;
    let left = Math.ceil(need / 2), right = need - left;
    let s2 = s, e2 = e;

    while (left > 0 && s2 > 0)         { s2--; left--; }
    while (right > 0 && e2 < tl.length - 1) { e2++; right--; }
    while (left > 0 && s2 > 0)         { s2--; left--; }
    while (right > 0 && e2 < tl.length - 1) { e2++; right--; }

    return tl.slice(s2, e2 + 1);
  }

  // Reactive: bygg filteredTimeline
  let filtered: any[] = [];
  let place = '—';
  let lat: number | undefined;
  let lon: number | undefined;

  $: {
    const tl = payload?.timeline ?? [];
    place = payload?.location?.name ?? '—';
    lat   = payload?.location?.lat;
    lon   = payload?.location?.lon;

    let out: any[] = [];

    // 1) Försök med serverns fönster (lokal tid om finns, annars UTC)
    const wFromLocal = payload?.window_ts?.from_local ?? payload?.window_ts?.from;
    const wToLocal   = payload?.window_ts?.to_local   ?? payload?.window_ts?.to;

    const clipped = clipByWindow(tl, wFromLocal, wToLocal);
    if (clipped) {
      out = expandToMinHours(clipped, tl);
    } else {
      // 2) Fallback: heuristik baserad på solhöjd/kvällstid
      out = buildEveningWindow(tl);
    }

    filtered = out;
  }

  // Debug helpers
  const hhmm = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const asLocal = (s?: string | null) => s ? hhmm(new Date(s.replace(' ', 'T'))) : '—';
</script>

<svelte:head><title>Ikväll</title></svelte:head>

{#if payload}
  <h2 style="margin:0 0 8px 0;">Ikväll</h2>
  <div style="opacity:.8; font-size:14px; margin-bottom:8px;">
    Plats: {place} · Lat/Lon: {lat}, {lon}
    <br />
    Fönster (lokal): {asLocal(payload?.window_ts?.from_local ?? payload?.window_ts?.from)}
    – {asLocal(payload?.window_ts?.to_local ?? payload?.window_ts?.to)}
    · {filtered.length}h
  </div>

  {#if filtered.length >= 2}
    <MeteogramCanvas timeline={filtered} width={980} height={440} />

    <!-- Debug: valda timmar (ta bort när klart) -->
    <details style="margin-top:8px; opacity:.8;">
      <summary>Valda timmar</summary>
      <div style="font-size:13px; display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
        {#each filtered as p}
          <span style="padding:2px 6px; border:1px solid #334155; border-radius:8px;">
            {hhmm(new Date((p.ts as string).replace(' ', 'T')))}
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
