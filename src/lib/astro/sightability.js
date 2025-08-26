export function calculateSightability(geomagneticScore, moonData, weatherData) {
  let score = geomagneticScore;

  // Moln reducerar
  if (weatherData.cloudiness != null) {
    if (weatherData.cloudiness > 75) score -= 3;
    else if (weatherData.cloudiness > 50) score -= 2;
    else if (weatherData.cloudiness > 25) score -= 1;
  }

  // Måne reducerar om stor och nära full
  if (moonData.fraction != null) {
    if (moonData.fraction > 0.9) score -= 2;
    else if (moonData.fraction > 0.5) score -= 1;
  }

  if (score < 0) score = 0;
  if (score > 10) score = 10;

  return score;
}
