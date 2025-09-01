<script>
  import { getContext } from 'svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import ScoreCard from '$lib/ui/ScoreCard.svelte';
  import BreakdownList from '$lib/ui/BreakdownList.svelte';
  import {
    staleBadge,
    lightCategoryKey,
    deriveNowNumbers,
    computedForText,
    chipTextsFromInputs,
    potentialSourceLabel
  } from '$lib/ui/presenters.js';

  export let payload = null; // { current, err }
  const { t, fmt } = getContext('i18n');

  const cur = payload?.current;
  const err = payload?.err;

  $: locName = cur?.location?.name || cur?.current?.location_name || '—';
  $: lat = cur?.location?.lat?.toFixed?.(5);
  $: lon = cur?.location?.lon?.toFixed?.(5);

  $: badgeKind = staleBadge(cur?.current?.stale_status);
  $: badgeText = cur?.current
    ? t('ui.stale', {
        age: (cur.current.stale_hours ?? 0).toFixed(2),
        status: t('status.' + (cur.current.stale_status || 'unknown'))
      })
    : '';

  $: computedText = computedForText(cur?.current, fmt, t);
  $: ({ potential10, sight10, kpProxy } = deriveNowNumbers(cur?.current, cur?.geomNow));
  $: lightKey = lightCategoryKey(cur?.current?.light_category);
  $: inputs = cur?.current?.sightability_detail?.inputs;
  $: ({ sunTxt, moonTxt, cloudsTxt } = chipTextsFromInputs(inputs, t));
  $: breakdown = cur?.current?.sightability_detail?.breakdown || [];
  $: potHint = potentialSourceLabel(cur?.current, cur?.geomNow, t);
</script>

{#if err}
  <div class="ui-wrap">
    <h1 class="ui-h1">{t('ui.now')} — {locName}</h1>
    <div class="ui-error">{t('errors.current_failed')}</div>
    <pre class="ui-small">{err}</pre>
  </div>
{:else if !cur}
  <div class="ui-wrap">
    <h1 class="ui-h1">{t('ui.now')} — {locName}</h1>
    <div>{t('ui.loading')}</div>
  </div>
{:else}
  <div class="ui-wrap">
    <header class="ui-head">
      <div>
        <h1 class="ui-h1">{t('ui.now')} — {locName}</h1>
        <div class="ui-meta">{t('ui.latlon', { lat, lon })}</div>
        {#if computedText}<div class="ui-meta">{computedText}</div>{/if}
      </div>
      <Badge kind={badgeKind} text={badgeText} />
    </header>

    <section class="ui-grid">
      <ScoreCard title={t('ui.potential')} value={potential10} hint={potHint || ''} />
      <ScoreCard title={t('ui.sight')}     value={sight10} />
      <ScoreCard title={t('ui.kpProxy')}   value={kpProxy != null ? Number(kpProxy).toFixed(2) : null} suffix="" />
      <div class="ui-card">
        <div class="ui-card__title">{t('ui.lightPollution')}</div>
        <div class="ui-card__value">{t(lightKey)}</div>
      </div>
    </section>

    <section class="ui-facts">
      <div class="ui-chip">{sunTxt}</div>
      <div class="ui-chip">{moonTxt}</div>
      <div class="ui-chip">{cloudsTxt}</div>
    </section>

    <section>
      <h2 class="ui-h2">{t('ui.whyNow')}</h2>
      <BreakdownList items={breakdown} />
    </section>
  </div>
{/if}
