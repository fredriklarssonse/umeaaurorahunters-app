
## Scripts (npm)
- `refresh:umea` → uppdaterar “current” (accepterar även `lat lon` eller `"lat,lon"`)
- `outlook:umea` → uppdaterar kvällens prognos
- (valfritt) `spots:community:*` → tips på populära platser nära

## TODO (kort)
- Koppla **riktig Kp-prognos** (SWPC) in i “outlook”
- Byta `lightZones` → **VIIRS/World Atlas** när du vill ha mer precision
- UI: visa **badge** för ljus (t.ex. “Suburban – Bortle 6”)


Kort recap: Projektet har central config i src/config/app-config.js.
Väder = MET+SMHI+Open-Meteo med viktad median, cache och disagree/outlier.
Geomagnetik = global score + latitud-justerad local score.
Sightability = sol+moln+måne+ljus (ljus provider default = zones).
DB aurora_forecast_current har extra light-kolumner och JSON-detaljer.
Scripts: npm run refresh:umea / outlook:umea (stöder även “lat lon”).
Nästa steg: koppla SWPC Kp-prognos, ev. VIIRS-provider “auto”.
Be mig läsa docs/DECISIONS.md om jag tappar tråden.

Aktivera Memory i ChatGPT: Settings → Personalization → Memory och berätta i en mening vad jag ska minnas (t.ex. “Kom ihåg att vårt projekt heter UmeåAuroraHunters, att config ligger i src/config/app-config.js och att LIGHT_PROVIDER=zones är default.”).