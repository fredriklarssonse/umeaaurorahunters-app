import SunCalc from 'suncalc';

export function getMoonData(lat, lon, date = new Date()) {
  const moonPos = SunCalc.getMoonPosition(date, lat, lon);
  const moonIllum = SunCalc.getMoonIllumination(date);

  return {
    altitude: moonPos.altitude,
    azimuth: moonPos.azimuth,
    distance: moonPos.distance,
    fraction: moonIllum.fraction,
    phase: moonIllum.phase
  };
}
