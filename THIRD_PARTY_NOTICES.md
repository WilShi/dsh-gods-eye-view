# Third-party notices

## God’s Eye View

Source: https://github.com/bilawalsidhu/gods-eye-view

Copyright (c) 2026 Bilawal Sidhu. Source code MIT License. The plugin launches the actual upstream checkout at `vendor/gods-eye-view`, installed from the pinned commit `c0a5d4141d4fa6f7648910cedd98654f2381989d`.

The local `build/embed-framing.js` change adds an origin-restricted `?embed=full` mode. The `src/app/embed.js` change keeps full UI while enabling the official view protocol. Neither change alters upstream data or imagery licenses. Upstream source terms, bundled data/model notices and provider terms remain authoritative. See the upstream `LICENSE` and `DATA_SOURCES.md`.

## Runtime providers

Third-party runtime data, imagery and models are not relicensed with this plugin. Current terms and attribution belong to their providers, including but not limited to:

- Esri World Imagery: https://www.esri.com
- OpenStreetMap and Nominatim: https://www.openstreetmap.org/copyright
- CesiumJS / Cesium ion: https://cesium.com/
- OpenSky and adsb.lol aircraft data
- CelesTrak orbital elements: https://celestrak.org/NORAD/elements/
- USGS earthquake feed: https://earthquake.usgs.gov/earthquakes/feed/
- Google Maps, AISStream, NASA FIRMS/GIBS, TomTom, Mapillary, KartaView, Panoramax and other sources enabled inside the upstream console

Review upstream `DATA_SOURCES.md` and each provider's terms before production or commercial use. A successful proxy or fallback response does not grant redistribution rights or guarantee availability.
