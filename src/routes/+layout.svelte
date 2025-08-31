<script>
  import '$appcss'; // alias nedan
  import { setContext } from 'svelte';
  import { makeI18n } from '$lib/i18n/i18n.js';
  export let data;

  const { t, fmt, dict, lang } = makeI18n(data.lang, data.dict);
  setContext('i18n', { t, fmt, dict, lang });
</script>

<slot />
