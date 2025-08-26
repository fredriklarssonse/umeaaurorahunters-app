
export function calculateSightability({ cloud_cover, moon_altitude, sun_altitude }) {
  let score = 100;

  // Moln
  if (cloud_cover > 80) score -= 60;
  else if (cloud_cover > 50) score -= 30;

  // Måne
  if (moon_altitude > 45) score -= 20;
  else if (moon_altitude > 15) score -= 10;

  // Solens position
  if (sun_altitude > 0) score -= 100; // dagtid, norrsken syns ej

  return Math.max(0, Math.min(100, score));
}