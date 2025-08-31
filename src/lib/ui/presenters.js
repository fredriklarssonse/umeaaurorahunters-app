// src/lib/ui/presenters.js

// Badge-färg för stale-status
export function staleBadge(status) {
  if (status === 'fresh') return 'ok';
  if (status === 'slightly-stale') return 'warn';
  if (status === 'stale') return 'err';
  return 'neutral';
}

// I18n-nyckel för ljuskategori (UI översätter nyckeln -> text)
export function lightCategoryKey(cat) {
  return 'light.' + (cat || 'unknown');
}

// Plocka fram kortvärdena som visas i ScoreCard
export function deriveNowNumbers(current, geomNow) {
  const potential10 =
    current?.geomagnetic_score ??
    current?.geomagnetic_detail?.global_score ??
    null;

  const sight10 =
    current?.sightability_detail?.score ??
    current?.sightability_probability ??
    null;

  const kpProxy =
    geomNow?.kp_proxy ??
    current?.kp_now ??
    null;

  return { potential10, sight10, kpProxy };
}

// “Uträknat för …”
export function computedForText(current, fmt, t) {
  if (!current?.time_tag) return '';
  return t('ui.computedFor', { datetime: fmt.dateTimeShort(current.time_tag) });
}

// Chip-texter (Sol/Måne/Moln)
export function chipTextsFromInputs(inputs, t) {
  const sunTxt =
    inputs?.sunAltitude != null
      ? `${t('ui.sun')} ${inputs.sunAltitude.toFixed(1)}°`
      : `${t('ui.sun')} —`;

  const moonTxt =
    inputs?.moonIllumination != null
      ? `${t('ui.moon')} ${(inputs.moonIllumination * 100).toFixed(0)}% @ ${(inputs.moonAltitude ?? 0).toFixed(1)}°`
      : `${t('ui.moon')} —`;

  const cloudsTxt =
    inputs?.cloudsPct != null
      ? `${t('ui.clouds')} ${inputs.cloudsPct.toFixed(0)}%`
      : `${t('ui.clouds')} —`;

  return { sunTxt, moonTxt, cloudsTxt };
}

// Källa: HPO/Kp/blend (visas som hint under Potential)
export function potentialSourceLabel(current, geomNow, t) {
  if (geomNow?.detail) {
    return t('ui.potentialSource', { src: t('potentialSource.blend') });
  }
  const src = current?.potential_source;
  if (!src) return null;
  return t('ui.potentialSource', { src: t('potentialSource.' + src) });
}
