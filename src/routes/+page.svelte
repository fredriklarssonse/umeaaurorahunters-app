<script>
  import NowView from '$lib/views/NowView.svelte';
  export let data; // { current, err }
</script>

<NowView payload={data} />
