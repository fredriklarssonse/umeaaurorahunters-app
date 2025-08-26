export async function fetchSolarWindNOAA() {
  const res = await fetch('https://services.swpc.noaa.gov/json/solar_wind.json')
  const data = await res.json()
  return {
    speed: data[0].speed,
    bz: data[0].bz,
    bt: data[0].bt,
    by: data[0].by,
    density: data[0].density
  }
}

export async function fetchKpIndexNOAA() {
  const res = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index.json')
  const data = await res.json()
  return { value: data[0].kp_index }
}
