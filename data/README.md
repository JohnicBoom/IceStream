`nwr-transmitters.json` is generated, not hand-edited. It lists every NOAA Weather Radio transmitter with its SAME county codes, frequency, site, status, and tower coordinates, from NOAA's county coverage data (`https://www.weather.gov/source/nwr/JS/ccl-data.js`). Regenerate with:

```sh
node scripts/build-nwr-transmitters.mjs
```

The plugin also refreshes this data from NOAA once a day at runtime, so the bundled copy only needs to be current enough for a fresh install.
