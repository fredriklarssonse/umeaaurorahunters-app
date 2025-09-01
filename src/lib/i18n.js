// src/lib/i18n.js
import { get } from 'svelte/store';
import { page } from '$app/stores';

/**
 * Enkel översättningsfunktion
 * Använd: t('ui.tonight.title')
 */
export function t(key, params = {}) {
  const dict = get(page)?.data?.dict ?? {};
  let s = dict[key] ?? key;

  for (const [k, v] of Object.entries(params)) {
    s = s.replace(new RegExp(`{${k}}`, 'g'), String(v));
  }
  return s;
}
