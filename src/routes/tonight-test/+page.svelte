<script>
  import { onMount } from 'svelte';
  let data = null, err = null;
  onMount(() => {
    fetch('/api/evening')
      .then(r => r.json()).then(j => data = j)
      .catch(e => err = e?.message || String(e));
  });
</script>


{#if err}
  <pre>{err}</pre>
{:else if !data}
  loading...
{:else}
  <pre>{JSON.stringify(data, null, 2)}</pre>
{/if}
