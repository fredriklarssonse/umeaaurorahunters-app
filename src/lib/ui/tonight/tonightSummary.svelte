<script>
  // Kompakt sammanfattning som använder i18n via $page.data.dict
  import { t } from '$lib/i18n';

  export let payload; // { location, now, timeline, observed? }

  const fmt = (n, d=1) => (typeof n === 'number' ? n.toFixed(d) : '—');

  // Här kan vi lätt lägga in fler rader (t.ex. "bästa timmen" etc)
  $: locName = payload?.location?.name ?? '—';
  $: lat = payload?.location?.lat;
  $: lon = payload?.location?.lon;
  $: nowPot = payload?.now?.potential;
  $: nowVis = payload?.now?.visibility;
  $: nowPotKey = payload?.now?.i18n?.potential || '';
  $: nowVisKey = payload?.now?.i18n?.visibility || '';
</script>

<div class="ui-card">
  <div class="ui-facts">
    <span class="ui-chip">{t('ui.location.label')}: {locName}</span>
    <span class="ui-chip">{t('ui.coords.latlon')}: {fmt(lat,4)}, {fmt(lon,3)}</span>
    <span class="ui-chip">{t('ui.now.potential')}: {fmt(nowPot,1)} · {t(nowPotKey)}</span>
    <span class="ui-chip">{t('ui.now.visibility')}: {fmt(nowVis,1)} · {t(nowVisKey)}</span>
  </div>
</div>
