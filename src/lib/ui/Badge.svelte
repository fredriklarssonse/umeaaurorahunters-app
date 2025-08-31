<script>
  export let text = '';
  export let kind = 'neutral'; // 'ok' | 'warn' | 'err' | 'neutral'
  $: cls = `ui-badge is-${kind}`;
</script>

<span class={cls}>{text}</span>
