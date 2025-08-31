<script>
  import { getContext } from 'svelte';
  import { renderBreakdown } from '$lib/i18n/i18n.js';
  export let items = []; // [{code, params}] eller fallback {label}

  const { t, dict } = getContext('i18n');
  $: lines = Array.isArray(items)
    ? (items[0] && items[0].code
        ? renderBreakdown(items, t, dict)
        : items.map(x => x.label || ''))
    : [];
</script>

<ul class="ui-list">
  {#each lines as line}
    <li>{line}</li>
  {/each}
</ul>
