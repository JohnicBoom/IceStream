# IceStream (repo: nwsradiostream) — durable context

This file is the project memory. The GitHub repo is the shared copy; this chat is not.

Repo: https://github.com/JohnicBoom/nwsradiostream
Plugin id: `io.github.johnicboom.nwsradiostream`
Local source: `/home/john/Work/nwsradiostream`
Installed (bar): `~/.config/omarchy/plugins/io.github.johnicboom.nwsradiostream` — **plain copy, not a git clone**. Edits in Work do not update the bar until copied. `omarchy plugin update` will not work until the install is a clone.

## Display name (decided)

**IceStream.** Plugin id stays `io.github.johnicboom.nwsradiostream` until a marketplace listing forces a freeze.

Description (honest, user-facing):

> Directly stream NOAA Weather Radio broadcasts from volunteer relays on wxradio. If your stream doesn't have a wxradio stream, a Broadcastify link is provided, though those must be used in a browser, and can't be directly streamed through the plugin.

Chrome copy says IceStream or volunteer Icecast relay — not “NWS Radio” as if it were the full network.

## What it is

Omarchy 4 bar widget + keep-loaded service. Plays **volunteer Icecast relays** of NOAA Weather Radio (wxradio.org). Not a VHF radio, not Broadcastify-in-process, not a life-safety tool, not an official NWS stream (NWS does not offer live NWR audio on the internet).

`omarchy plugin add <url> --enable` is enough to install. `defaultSection` is `center`. `--after omarchy.weather` only places it next to weather; it is not required for the plugin to run.

## IceStream polish (decided)

- Left-click: open/close the panel. Right-click: play/stop (real stop: kill mpv; not pause).
- No seek.
- Own volume slider (mpv), so IceStream can sit in the background under other apps. Stock Audio widget stays system-wide.
- PipeWire **peak** meter of this plugin’s playback (same idea as `PwNodePeakMonitor` on `omarchy.audio`), only while the popover is open. Not a fake FFT of a second Icecast download. Colors from `Color.accent` / theme tokens only.
- Serialized transport: one play/stop at a time; ignore stale completions (`playToken`). Clicks cannot overtake each other.
- Bar: icon-only plus live mark (sound arcs, not animated) while actually streaming — silence on NWR must not look like stopped.
- Locate with no Icecast for the covering dish: show that covering station + Broadcastify for **that** call sign only (browser-only). Do not pretend Plano is “your” stream.
- Status words: **Available** (we can play Icecast), **Offline** (we cannot play), **Browser-only** (Broadcastify listen page).
- Keys: Space play/stop, arrows in the list, `/` or filter field, Esc close, Tab to neighboring bar panels.
- Vertical bar: chip is a square `BarIconButton` slot; the radio mark should be fine. Still check `bar.vertical` once.

## Coverage (what NWS will actually tell us)

Not fully black-and-white at city scale.

- **Point → covering transmitter:** `GET /points/{lat},{lon}` → `properties.nwr.transmitter`. For Wood Dale / 60191 this is **KWO39 Chicago**. That is the NWS association for that point.
- **County SAME list:** `GET /radio/{callSign}` `sameCodes` / `counties`. **KXI58 Plano includes DuPage `017043`.** Wood Dale is in DuPage, so Plano is a SAME-alerting transmitter for that **county**. A county can have several transmitters; the county table lists each on its own row.
- **RF reception:** not binary. NWS coverage is “about 40 miles, level terrain,” with partial-county remarks and PCA partitions in some offices. We cannot say “you will hear Plano in Wood Dale.”
- **Icecast:** independent of both. KWO39 has no wxradio.org mount. KXI58 does. Playing Plano is a *nearby Icecast*, not “the covering station.”

Locate UI: name KWO39 as covering; Icecast play only if that call sign has a mount; else Broadcastify for KWO39 if we have a page (32452 is dead). Do not auto-promote Plano as coverage.

## Architecture

- **QML** (`ui/`): bar chip, popover, mpv process. Presentation and process wiring only.
- **Service** owns playback so closing the popover does not stop audio.
- **lib/*.js**: catalog, locate, match, player state, spectrum, Broadcastify listen-page map. Node-testable. QML imports the same files.
- **Playback:** `bin/nwsradiostream-play.sh` → `exec /usr/bin/mpv` on the Icecast listen URL (`http://wxradio.org:8000/<mount>`). Do **not** rewrite to `https://wxradio.org/<mount>` as the play URL; that failed in mpv even when curl GET worked. Icecast often **400s HEAD**; probe with GET.
- **Stop:** `bin/nwsradiostream-stop.sh` pkills only `mpv` with `--audio-client-name=nwsradiostream`. Call on stop, on play-fail, on Service destruction, and while UI is idle/error so orphans cannot outlive the UI.
- **Locate:** ZIP (Zippopotam) or city (Open-Meteo) → `api.weather.gov/points/{lat},{lon}` → `properties.nwr.transmitter`. That is the **covering** dish, not haversine-nearest. Then `GET /radio/{callSign}` for metadata. `GET /points/…/radio` is SSML forecast speech, **not** the radio stream.
- **List ranking after locate:** `preferNearby` — overlapping call signs first, then same state, then the rest. Do not leave the raw Icecast order (AK/AZ/CA before IL).
- **Theme:** `Color` / `Style` singletons. Do not import `QtQuick.Effects` (Omarchy blackholes it; the bar icon vanished). Draw the radio with `QtQuick.Shapes`.
- **Spectrograph:** popover only, while open **and** playing. Analyzer is ffmpeg PCM → `bin/nwsradiostream-analyze.mjs`.

## Tests and validate

```sh
node --test tests/*.test.mjs
omarchy plugin validate .
```

`omarchy plugin validate` checks the **manifest folder** (schema, id, kinds, entry points, no symlinks). Silent exit 0 is success. It does not run QML, mpv, or unit tests.

TDD lives in `lib/` + `tests/`. Write the failing test first.

## Stream coverage (growth path)

NOAA has ~1,000 VHF transmitters. Only volunteer Icecast relays are playable. wxradio.org is the main nexus (~120 live mounts when last counted). Missing cities (e.g. **KZZ81 Lockport**) are missing because nobody is encoding that dish to Icecast, not because the plugin failed to search.

### Do this, in order

1. **Keep wxradio.org as primary.** Refresh `status-json.xsl` (port 8000). New mounts appear without a code change if they follow `ST-Name-CALL`.
2. **Merge other free catalogs by call sign.** One station, several URLs; prefer a working Icecast listen URL.
   - weatherUSA: `https://radio.weatherusa.net/NWR/…` (volunteer Icecast, lots of overlap)
   - GWES WeatherRadio: https://weatherradio.org/ (~57 community streams)
   - Radio Browser API (public domain, no key): https://de1.api.radio-browser.info — search name/tag NOAA; many hits **are** wxradio.org again, plus independents (bobc.io, rollernet, hobby Icecast). Filter junk; quality varies.
3. **Probe liveness with GET**, never HEAD.
4. **Ask operators to feed wxradio.org** for a missing transmitter (their howto). That is how coverage actually grows.
5. **Broadcastify:** listen page only (`https://www.broadcastify.com/listen/feed/{id}`). Terms forbid programmatic audio/metadata. Do not mpv their streams. Hand-maintained map: `data/broadcastify-nwr.json` (`online` is a hint, not a live scrape). KWO39 Chicago page is dead; KZZ81 Lockport 46216 is the live Chicago-area listen page.
6. **Do not use:** TuneIn/ScannerRadio catalogs, official NWS live audio (does not exist), scraping Broadcastify.

RTL-SDR / local VHF is a later hardware feature, not an internet catalog.

## Pitfalls already paid for

- `set -e` + `pgrep` with no matches in the play script exited **before** `exec mpv` → every station Offline.
- Losing the Process handle left mpv running; only `omarchy restart shell` stopped it. Always pkill the plugin’s mpv client name on stop/fail/idle.
- `QtQuick.Effects` / `MultiEffect` is blocked in third-party plugins.
- Covering transmitter from NWS may have **no** Icecast mount. Show that honestly; do not autoplay a distant same-state stream as if it were the local dish.
- Marketplace listing is optional and pins a snapshot. Wait until playback stays healthy without a shell restart, then add `preview.png` and submit at https://plugins.omarchy.org/publish.html (GitHub issue on `omacom/omarchy-plugin-marketplace`). `omarchy plugin add` from the repo URL is enough to distribute.

## Install for other people

```sh
omarchy plugin add https://github.com/JohnicBoom/nwsradiostream.git --enable
```
