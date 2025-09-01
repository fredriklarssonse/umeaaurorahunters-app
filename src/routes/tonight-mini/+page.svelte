<script>
  import { onMount } from 'svelte';
  import MeteogramCanvas from '$lib/ui/tonight/MeteogramCanvas.svelte';

  let loading = true, err = null;
  let payload = null;      // /api/evening
  let liveClouds = null;   // /api/clouds-now

  async function loadAll() {
    err = null;
    try {
      // Använd mock=1 tills vi växlar till riktigt backend-flöde
      const r = await fetch('/api/evening?mock=1');
      if (!r.ok) throw new Error(`evening ${r.status}`);
      payload = await r.json();

      const lat = payload?.location?.lat ?? 63.8258;
      const lon = payload?.location?.lon ?? 20.263;

      const rl = await fetch(`/api/clouds-now?lat=${lat}&lon=${lon}`);
      if (!rl.ok) throw new Error(`clouds-now ${rl.status}`);
      const lj = await rl.json();
      liveClouds = lj?.samples ?? null;
    } catch (e) {
      err = String(e?.message ?? e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadAll();
    const id = setInterval(loadAll, 10 * 60 * 1000);
    return () => clearInterval(id);
  });
</script>

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
