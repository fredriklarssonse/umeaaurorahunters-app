<script>
  import { onMount } from 'svelte';
  import MeteogramCanvas from '$lib/ui/tonight/MeteogramCanvas.svelte';

  let status = 'init';
  let info = '';
  let payload = null;

  // Använd explicit API-bas i dev (Vite)
  const API_BASE = import.meta.env?.DEV ? 'http://localhost:3000' : '';
  const apiUrl = (path) => `${API_BASE}${path}`;

  function toHours(ts) {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2, '0');
  }

  onMount(async () => {
    try {
      status = 'loading';
      const sp = new URLSearchParams(location.search);
      const sim = sp.get('sim');

      const url = sim
        ? apiUrl(`/api/evening?sim=${encodeURIComponent(sim)}`)
        : apiUrl('/api/evening');

      const r = await fetch(url, { headers: { accept: 'application/json' } });
      const text = await r.text();

      if (!r.ok) {
        status = `HTTP ${r.status}`;
        info = text.slice(0, 300);
        return;
      }

      const json = JSON.parse(text);
      payload = json;
      status = 'ok';

      const tl = Array.isArray(payload.timeline) ? payload.timeline.length : 0;
      info = `timeline: ${tl} punkter`;
      console.log('[tonight-mini] payload', {
        loc: payload.location,
        now: payload.now,
        tl
      });
    } catch (e) {
      status = 'error';
      info = String(e);
      console.error(e);
    }
  });
</script>

<svelte:head>
  <title>Ikväll</title>
</svelte:head>

<div class="wrap">
  <h1>Ikväll</h1>

  {#if status === 'loading'}
    <div class="card">Laddar…</div>
  {:else if status !== 'ok'}
    <div class="card error">
      <div><strong>/tonight-mini — sanity</strong></div>
      <div>Status: {status}</div>
      {#if info}<pre class="small">{info}</pre>{/if}
      <div class="hint">Tips: lägg till <code>?sim=1</code> i URL:en.</div>
    </div>
  {:else}
    <!-- Sanity-kort -->
    <div class="card">
      <div><strong>/tonight-mini — sanity</strong></div>
      <div>Status: {status}</div>
      <div>{info}</div>
      <details>
        <summary>Visa rå payload</summary>
        <pre class="small">{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>

    <!-- Snabb summering -->
    <div class="card">
      <div class="row">
        <div>
          <div class="muted">Plats</div>
          <div class="big">{payload.location?.name ?? '—'}</div>
        </div>
        <div>
          <div class="muted">Fönster</div>
          {#if Array.isArray(payload.timeline) && payload.timeline.length > 0}
            <div class="big">
              {toHours(payload.timeline[0].ts)}–{toHours(payload.timeline.at(-1).ts)}
            </div>
          {:else}
            <div class="big">—</div>
          {/if}
        </div>
      </div>
    </div>

    <!-- METEOGRAM -->
    {#if Array.isArray(payload.timeline) && payload.timeline.length >= 2}
      <div class="card">
        <!-- Din fungerande canvas-komponent -->
        <MeteogramCanvas
          timeline={payload.timeline}
          width={980}
          height={440}
        />
      </div>
    {:else}
      <div class="card">Ingen tidsserie att visa.</div>
    {/if}
  {/if}
</div>

<style>
  .wrap { max-width: 1040px; margin: 24px auto; padding: 0 16px; color: #e5e7eb; }
  h1 { margin: 0 0 12px 0; font-size: 22px; }
  .card {
    background: #0b1020; border: 1px solid #1f2937; border-radius: 12px; padding: 12px;
  }
  .card + .card { margin-top: 12px; }
  .error { border-color: #7f1d1d; }
  .small { font-size: 12px; white-space: pre-wrap; }
  .muted { font-size: 12px; opacity: .7; }
  .big { font-size: 18px; font-weight: 600; }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .hint { margin-top: 6px; opacity: .8; }
  code { background: #111827; padding: 0 4px; border-radius: 4px; }
</style>
