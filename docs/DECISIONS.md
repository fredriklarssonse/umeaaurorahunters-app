# UmeåAuroraHunters – beslut & konventioner

## Struktur & namngivning
- Modulnamn/filnamn: `kebab-case.js` (ex: `calculate-geomagnetic-score.js`)
- Funktioner: `camelCase` (ex: `updateForecast`, `getWeatherHourly`)
- Konfig: **all konfig i** `src/config/app-config.js` (styr vikter, trösklar, provider-val, cache)
- I/O-moduler: `src/lib/**` organiserat per domän (`astro/`, `aurora/`, `light/`, `lightpollution/`, `db/`, `geo/`, `spots/`)

## Dataflöde (nu)
1) **Solvind** → `fetchSolarWindHistory()` → `aurora_solar_wind` (med `suspect_data`-flagga)
2) **Geomagnetik** → `calculateGeomagneticScoreDetailed()`  
   - *Global score* (0–10) + breakdown
   - **Latitud-justering** → `adjustGeomagneticForLatitude()` ⇒ *Local score* (platsberoende)
3) **Väder (moln)** → `getWeatherData()` / `getWeatherHourly()`  
   - Källor: MET Norway + SMHI + Open-Meteo  
   - Konsensus: **viktad median** (vikter i config) + `disagree/spread/outlier`
   - Cache: disk, TTL i config
4) **Ljusförorening** → `getLightPollution()`  
   - **Default provider:** `zones` (urban/suburban/rural via stadskärne-radier)  
   - Alternativ: `viirs_geotiff` (COG-GeoTIFF via `LIGHT_VIIRS_TIFF`)
5) **Sightability (0–10)** → `calculateSightabilityDetailed(localGeo, moon, weather, light)`  
   - Komponenter: Sol (gate vid `sunGateDeg`), Moln, Måne, **Ljus**  
   - Måne & Ljus viktas dynamiskt: större påverkan vid svag geomagnetik
6) **Spara “current”** → `updateForecast()` → tabell `aurora_forecast_current`
   - Kolumner (utöver solvind):  
     `geomagnetic_score` = **platsjusterad** (local),  
     `sightability_probability`,  
     `light_source/category/bortle/radiance`, `light_detail` (JSON),  
     `geomagnetic_detail` (JSON global+local), `sightability_detail` (JSON),  
     `stale_hours`, `stale_status`
7) **Kvällens prognos** → `updateEveningForecast()` → `aurora_forecast_outlook`  
   - Säsongsanpassade fönster “Tidiga/Sena kvällen”
   - Använder **lokal geomagnetik** (persistens), timvis moln & ljus

## Platser
- `resolveLocation(input)` tar **`"umea"`/`"ostersund"`** eller **`{ lat, lon, name? }`**
- Ljuszoner (MVP): `CONFIG.lightZones` (center + `urban_km` + `suburban_km`)
- Kommande: VIIRS/World Atlas raster utan att ändra anropsgränssnittet

## Community-spots (frivilligt)
- Tabell `aurora_spots` (offentliga platser) + RPC `get_spots_within(lat,lon,radius_km)`
- Ranking: `suggestCommunitySpots()` väger **sightability**, **ljus**, **avstånd**, **popularitet**

## Miljövariabler (viktiga)
SUPABASE_URL=...
SUPABASE_ANON_KEY=...

(service role används endast i server-skript om du kör dem – aldrig i klient)
Väder

WEATHER_CACHE_DIR=./cache
WEATHER_CACHE_TTL_MIN=30
MET_USER_AGENT=UmeaaAuroraHunters/1.0 (kontakt@exempel.se
)
WEIGHT_MET=0.5
WEIGHT_SMHI=0.3
WEIGHT_OPENMETEO=0.2

Sightability/sol

SUN_GATE_DEG=-8
W_SUN=1.0
W_CLOUDS=1.6
W_MOON_LOWGEO=1.2
W_MOON_HIGHGEO=0.35
W_LIGHT_LOWGEO=1.0
W_LIGHT_HIGHGEO=0.3

Ljusförorening provider

LIGHT_PROVIDER=zones # alt: auto | viirs_geotiff
LIGHT_VIIRS_TIFF=<COG-url eller lokal .tif>

Övrigt

DISAGREE_THRESHOLD_PCT=40


## Scripts (npm)
- `refresh:umea` → uppdaterar “current” (accepterar även `lat lon` eller `"lat,lon"`)
- `outlook:umea` → uppdaterar kvällens prognos
- (valfritt) `spots:community:*` → tips på populära platser nära

## TODO (kort)
- Koppla **riktig Kp-prognos** (SWPC) in i “outlook”
- Byta `lightZones` → **VIIRS/World Atlas** när du vill ha mer precision
- UI: visa **badge** för ljus (t.ex. “Suburban – Bortle 6”)