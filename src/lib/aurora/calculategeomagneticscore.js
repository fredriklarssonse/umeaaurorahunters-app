/**
 * Beräknar geomagnetic_score baserat på historik
 * Filtrerar bort suspekta värden
 */
export function calculateGeomagneticScore(dataHistory) {
  if (!dataHistory || dataHistory.length === 0) return 0;

  const filtered = dataHistory.filter(d => !d.suspect);

  if (filtered.length === 0) return 0;

  filtered.sort((a, b) => new Date(a.time_tag) - new Date(b.time_tag));

  let score = 0;

  const btAvg = filtered.reduce((sum, d) => sum + d.bt, 0) / filtered.length;

  if (btAvg >= 20) score += 4;
  else if (btAvg >= 10) score += 3;
  else if (btAvg >= 3) score += 2;

  // BZ
  let bzNegativeDuration = 0;
  const bzSum = filtered.reduce((sum, d) => {
    if (d.bz < 0) bzNegativeDuration += 1;
    return sum + d.bz;
  }, 0);

  const bzAvg = bzSum / filtered.length;
  const bzMin = Math.min(...filtered.map(d => d.bz));

  if (bzNegativeDuration >= 240) score += 3;
  else if (bzNegativeDuration >= 120) score += 2;
  else if (bzNegativeDuration >= 30) score += 1;

  if (bzMin <= -20) score += 2;
  else if (bzMin <= -10) score += 1;

  if (bzAvg > 0) score -= 1;

  // Densitet och hastighet
  const speedAvg = filtered.reduce((sum, d) => sum + d.speed, 0) / filtered.length;
  const densityAvg = filtered.reduce((sum, d) => sum + d.density, 0) / filtered.length;

  if (speedAvg > 500 && densityAvg > 5) score += 2;
  else if (speedAvg > 500 || densityAvg > 5) score += 1;
  else if (speedAvg < 400 && btAvg < 10) score -= 1;

  if (score > 10) score = 10;
  if (score < 0) score = 0;

  return score;
}
