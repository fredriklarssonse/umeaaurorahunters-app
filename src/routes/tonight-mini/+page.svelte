<script>
  import { onMount } from 'svelte';
  import MeteogramCanvas from '$lib/ui/tonight/MeteogramCanvas.svelte';

  let data = null, err = null, loading = true;

  // Hjälpare för att plocka solhöjd ur breakdown
  const sunAlt = (p) => {
    const vis = p?.breakdown?.visibility;
    if (!Array.isArray(vis)) return null;
    const tw = vis.find(v => v?.code === 'breakdown.twilight')?.params;
    return typeof tw?.elevationDeg === 'number' ? tw.elevationDeg : null;
  };

  // Klipp timeline till mörka timmar (≤ -3°), minst 6 timmar
  function clipToNight(timeline) {
    if (!Array.isArray(timeline) || timeline.length === 0) return timeline;

    // markera mörka index
    const darkIdx = timeline
      .map((p, i) => ({ i, a: sunAlt(p) }))
      .filter(o => o.a !== null && o.a <= -3)
      .map(o => o.i);

    if (darkIdx.length === 0) {
      // fallback: ta fönster om 6 h centrerat kring minsta solhöjd
      let minI = 0, minA = +Infinity;
      timeline.forEach((p, i) => {
        const a = sunAlt(p);
        if (a !== null && a < minA) { minA = a; minI = i; }
      });
      const half = 3;
      const start = Math.max(0, minI - half);
      const end   = Math.min(timeline.length, start + 6);
      return timeline.slice(start, end);
    }

    // ta sammahängande segment som täcker alla mörka index
    const start = Math.max(0, Math.min(...darkIdx));
    const end   = Math.min(timeline.length, Math.max(...darkIdx) + 1);

    // säkerställ minst 6 timmar
    const need = 6 - (end - start);
    const padL = Math.ceil(Math.max(0, need) / 2);
    const padR = Math.floor(Math.max(0, need) / 2);
    const s2 = Math.max(0, start - padL);
    const e2 = Math.min(timeline.length, end + padR);
    return timeline.slice(s2, e2);
  }

  onMount(async () => {
    try {
      loading = true;

      // plocka ?sim=1 från sidans query och passa vidare till API:t
      const params = new URLSearchParams(location.search);
      const sim = params.get('sim');
      const url = sim ? `/api/evening?sim=${encodeURIComponent(sim)}` : '/api/evening';

      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();

      const tl = clipToNight(payload.timeline || []);
      data = {
        ...payload,
        timeline: tl
      };
    } catch (e) {
      err = e;
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <div class="ui-card">ui.loading</div>
{:else if err}
  <div class="ui-card ui-error">{String(err)}</div>
{:else}
  <div class="ui-wrap">
    <div class="ui-head">
      <h1 class="ui-h1">Ikväll</h1>
      <div class="ui-meta">
        {data?.location?.name} · {data?.location?.lat?.toFixed(4)}, {data?.location?.lon?.toFixed(3)}
      </div>
    </div>

    <!-- MeteogramCanvas får redan timeline med clouds/twilight/moon -->
    <MeteogramCanvas timeline={data.timeline} />

    <div class="ui-small" style="margin-top:8px;opacity:.7">
      Tips: lägg till <code>?sim=1</code> i URL:en för simulerad kväll.
    </div>
  </div>
{/if}


<div class="ui-wrap">
  {#if loading}
    <div class="ui-card">ui.loading</div>
  {:else if err}
    <div class="ui-error">{err}</div>
  {:else if payload}
    <div class="ui-head">
      <div>
        <div class="ui-h1">Ikväll</div>
        <div class="ui-meta">
          Plats: {payload.location.name} · Lat/Lon: {payload.location.lat}, {payload.location.lon}
        </div>
      </div>
    </div>

    <div class="ui-card" style="padding:0;">
      <MeteogramCanvas timeline={payload.timeline} liveClouds={liveClouds} />
    </div>
  {:else}
    <div class="ui-card">ui.empty</div>
  {/if}
</div>
