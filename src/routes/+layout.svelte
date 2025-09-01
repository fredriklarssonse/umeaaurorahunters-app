<!-- src/routes/+layout.svelte -->
<script lang="ts">
  // Tidigare stod det: import '$appcss'
  // Byt till den riktiga filen vi redan har:
  import '../app.css';
</script>

<slot />
