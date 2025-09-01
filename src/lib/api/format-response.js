// src/lib/api/format-response.js
'use strict';

/**
 * Standardiserar API-svar för alla prognos-endpoints.
 */
export function buildResponse({ location, nowPoint, timelineBasic, timelinePro }) {
  return {
    meta: { version: 1, unit: 'score0_10' },
    location: {
      name: location.name,
      lat: Number(location.lat),
      lon: Number(location.lon),
    },
    now: {
      potential: round1(nowPoint.potential),
      visibility: round1(nowPoint.visibility),
      i18n: {
        potential: mapPotentialKey(nowPoint.potential),
        visibility: mapVisibilityKey(nowPoint.visibility),
      },
    },
    timeline_basic: timelineBasic.map(mapTimelinePoint),
    timeline_pro: (timelinePro || timelineBasic).map(mapTimelinePoint),
  };
}

function mapTimelinePoint(p) {
  return {
    ts: new Date(p.ts).toISOString(),
    potential: round1(p.potential),
    visibility: round1(p.visibility),
    breakdown: {
      potential: (p.breakdown?.potential || []).map((b) => ({
        code: String(b.code),
        params: b.params || {},
      })),
      visibility: (p.breakdown?.visibility || []).map((b) => ({
        code: String(b.code),
        params: b.params || {},
      })),
    },
  };
}

function mapPotentialKey(v) {
  if (v >= 8) return 'forecast.potential.extreme';
  if (v >= 6) return 'forecast.potential.high';
  if (v >= 4) return 'forecast.potential.moderate';
  if (v >= 2) return 'forecast.potential.low';
  return 'forecast.potential.very_low';
}
function mapVisibilityKey(v) {
  if (v >= 8) return 'forecast.visibility.excellent';
  if (v >= 6) return 'forecast.visibility.good';
  if (v >= 4) return 'forecast.visibility.moderate';
  if (v >= 2) return 'forecast.visibility.poor';
  return 'forecast.visibility.very_poor';
}
function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

// src/lib/api/format-response.js

/**
 * Format a successful API response
 */
export function formatApiOk(data) {
  return {
    ok: true,
    time: new Date().toISOString(),
    ...data
  };
}

/**
 * Format an error API response
 */
export function formatApiErr(error, details = {}) {
  return {
    ok: false,
    time: new Date().toISOString(),
    error,
    details
  };
}
