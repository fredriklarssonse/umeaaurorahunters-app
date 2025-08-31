<script>
  export let title = '';
  export let value = null;   // 0..10 eller null
  export let suffix = '/ 10';
  export let hint = '';

  // progressbredd via CSS-variabel (enda “inline” vi nyttjar)
  $: pct = value == null ? 0 : Math.max(0, Math.min(100, (value/10)*100));
</script>

<div class="ui-card">
  <div class="ui-card__title">{title}</div>
  <div class="ui-card__value">{value ?? '—'} {value != null ? suffix : ''}</div>
  {#if hint}<div class="ui-card__hint">{hint}</div>{/if}
  {#if value != null}
    <div class="ui-bar">
      <div class="ui-bar__fill" style="--pct: {pct}%"></div>
    </div>
  {/if}
</div>
