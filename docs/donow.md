Gör nu (låg insats, hög effekt)

API-kontrakt (utan DB-migration):

Lägg till transienta fält i JSON-svaret (beräknas i servern, behöver inte sparas ännu):

potential_now (0–10), activity_now (0–3 eller text), confidence (low/med/high),

cloud_layers: {low, mid, high} om tillgängligt, annars null,

twilight_phase: day|civil|nautical|astro|night,

provenance: vilka källor användes (met/smhi/open-meteo, hpo/kp).

Samma för /hourly: per timme potential, sight, cloud_layers, confidence, twilight_phase.

Feature flags & config:

CONFIG.features = { showCloudLayers, showActivity, showConfidence, widgetsDTO }

Design tokens i en fil (CSS-variabler): färger, spacing, radie – så stilbyte blir trivialt senare.

i18n-skelett:

Små JSON-lexikon sv.json / en.json + en enkel t(key) wrapper. Använd Intl för datum/nummer.

Entitlements (utan att låsa pris nu):

API kan läsa entitlements från minne/.env (till att börja med): { isPro, maxAlertsPerWeek, alertDelayMin, maxLocations, adsEnabled }

UI kan reagera på detta redan nu (låser upp widgets/advanced m.m. när vi bestämt modell).

Widget-DTO:

En liten struktur vi redan fyller i servern (cachebar):
{ when, locationLabel, sightNow, bestHour, bestSight, cloudsNow, staleBadge }

Snart (när PDF:en är på plats)

Aktivitetsklass (”substorm”-signal) – V1:

Servern klassar till en av: low | primed | active | fading baserat på enkla trösklar (HP/AE/Bz-runtime om finns, annars “unknown”).

Visa bara som chip i UI; detaljer sparar vi till Advanced.

Molnskikt:

Försök MET low|mid|high, fallback Open-Meteo, annars heuristik från total %. Lägg i cloud_layers.

Confidence:

Beräkna från källspridning + horisont (timmar framåt) → low/med/high. Returnera endast i API just nu.

Senare

DB-migreringar (när vi sett att fälten sätter sig): tabeller för hourly/forecast kan få kolumner för activity, cloud_layers, confidence om vi vill lagra historik.

Widgets native + bakgrundsrefresh (DTO finns redan).

Betalnivåer (engångs-Pro + ev. Season/Trip pass) – aktiveras via entitlements.

Community/”faktiskt utfall”: enkla sightings, webcams, lokala magnetometrar.

Process & struktur

Islands-arkitektur: NowCard och HourlyPanel lastas separat; skeletons <200 ms; ingen tung grafik i v1 (ren SVG/div-bars).

Versionera API lätt: /api/v1/… så vi kan lägga till utan att bryta.

Docs: lägg en docs/UX-notes.md + docs/API-contract.md i repo där vi samlar det du skriver i PDF:en (lätt att jämföra).

Trög chat?

Ja, ibland blir UI:et segt. Saker som brukar hjälpa:

Starta om webbläsaren; tråden brukar ligga kvar (du är inloggad).

Stäng tunga flikar/fönster, särskilt live-dev-servrar.

Fortsätt gärna pusha allt till Git (du har npm run push).

Om något viktigt riskerar försvinna: lägg det även i docs/ i repo.

Skicka PDF:en när den är klar så gör jag den samlade planen direkt och pekar ut eventuella små datahål vi bör fylla.