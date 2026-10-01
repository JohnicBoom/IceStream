# IceStream — durable context

This file is the project memory. The GitHub repo is the shared copy; this chat is not.

Repo: https://github.com/JohnicBoom/IceStream
Plugin id: `com.johnicboom.icestream`
Local source: `/home/john/Work/IceStream`
Installed (bar): `~/.config/omarchy/plugins/com.johnicboom.icestream` — **plain copy, not a git clone**. Edits in Work do not update the bar until copied. `omarchy plugin update` will not work until the install is a clone.

## Display name (decided)

**IceStream.** Plugin id is `com.johnicboom.icestream`. A marketplace listing would freeze that id.

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
- No popover visualizer. The panel is for finding a station and starting it; then it stays out of the way. Playing state on the bar is the live mark (sound arcs).
- Serialized transport (`lib/transport.js`): one play/stop at a time; ignore stale completions (`playToken`). Clicks cannot overtake each other. A new mpv only starts after `icestream-stop.sh` has finished and the previous mpv has exited.
- **Playing** means mpv is decoding audio: `Playback.qml` observes mpv's `core-idle` over the IPC socket (`Quickshell.Io.Socket`, no python). Until then it is **Connecting**. If mpv exits first, the state is **Offline** (error) with a message.
- Locating (panel open, middle-click, Find closest) never touches playback or the saved station.
- Bar: icon-only plus live mark (sound arcs, not animated) while actually streaming — silence on NWR must not look like stopped.
- Locate: always name the NWS **covering** transmitter. Rank *online* options (wxradio Icecast or live Broadcastify listen page) first, then by distance to the NOAA transmitter **tower** — not RF maps. For Wood Dale / 60191: KWO39 covering (tower ~30 km, downtown Chicago), Icecast offline, Broadcastify offline; closest working online is **KZZ81 Lockport** (Browser-only, ~40 km); **KXI58 Plano** is Icecast Available but farther (~56 km). Offer covering (honest Offline) plus those online options. No map view for now.
- Status words: **Available** (we can play Icecast), **Offline** (we cannot play; clicking the row explains instead of opening a dead page; also shown after a failed play), **Browser-only** (live Broadcastify listen page).
- Keys: Space play/stop, Up/Down (or j/k) move through Closest stations then the relay list, Enter plays the highlighted row, `/` focuses the filter (Esc or Down returns to the list), Esc closes, Tab to neighboring bar panels.
- Vertical bar: chip is a square `BarIconButton` slot; the radio mark should be fine. Still check `bar.vertical` once.

## Coverage (what NWS will actually tell us)

Not fully black-and-white at city scale.

- **Point → covering transmitter:** `GET /points/{lat},{lon}` → `properties.nwr.transmitter`. For Wood Dale / 60191 this is **KWO39 Chicago**. That is the NWS association for that point.
- **County SAME list:** per transmitter, from NOAA's county coverage data (bundled `data/nwr-transmitters.json`; `GET /radio/{callSign}` `sameCodes` agrees and is the live fallback). **KXI58 Plano includes DuPage `017043`.** Wood Dale is in DuPage, so Plano is a SAME-alerting transmitter for that **county**. A county can have several transmitters; the county table lists each on its own row.
- **RF reception:** not binary. NWS coverage is “about 40 miles, level terrain,” with partial-county remarks and PCA partitions in some offices. We cannot say “you will hear Plano in Wood Dale.”
- **Icecast:** independent of both. KWO39 has no wxradio.org mount. KXI58 does. Playing Plano is a *nearby Icecast*, not “the covering station.”

Locate UI: KWO39 is covering (Offline Icecast, Broadcastify page dead). Still offer KZZ81 (closest working online, Browser-only) and KXI58 Plano (Available Icecast, farther). We ignore VHF hearability; we only rank sources the plugin can actually open.

## Architecture

- **QML** (`ui/`): presentation and process wiring only.
  - `BarWidget.qml` / `Panel.qml`: bar chip and popover. They talk only to the Service facade.
  - `Service.qml`: keep-loaded facade (the API BarWidget/Panel use). Owns playback so closing the popover does not stop audio. Composes:
    - `Playback.qml`: player state, mpv process + stop script, mpv IPC socket, saved settings. Performs the effects `lib/transport.js` returns; decides nothing about ordering itself.
    - `Locator.qml`: ZIP / weather.json / IP → NWS `/points` → covering transmitter → Closest stations. Never touches playback.
    - `Catalogs.qml`: Icecast mounts (hourly), NOAA transmitters (bundled + daily), Broadcastify map.
  - `Fetch.qml`: one-shot curl wrapper. Each run reports once with the token it was started with; locate chains ignore stale tokens.
- **lib/*.js**: all decisions, Node-tested. QML imports the same files. `transport.js` is the playback sequencing state machine (events in, effects out); `player.js` is user-facing status + settings; `mpv.js` IPC lines; `catalog`, `nwr`, `locate`, `match`, `broadcastify`; `version.js` (below).
- **Updates need a shell restart (all of the plugin, not just the Service):** Omarchy's hot reload recreates the bar widget, but Quickshell has no `Qt.clearComponentCache`, so Qt hands back the **cached old** `BarWidget.qml`/`Panel.qml`; and a `keepLoaded` Service is never replaced (plugins cannot restart it). Verified: recreating a component from an edited file returns the old code. So after `omarchy plugin update` everything runs the old version until `omarchy restart shell`. Detection therefore lives in the *running* code: BarWidget watches `manifest.json` (FileView survives git's rename-replace; also re-read on panel open) and compares its version with `lib/version.js` `CODE` (must equal `manifest.json`; a test checks). If they differ, or the Service's `codeVersion` differs, the tooltip and popover say "IceStream X is installed. Run `omarchy restart shell` to finish updating." The popover shows the running version bottom-right. This only works from 0.3.0 on (older versions have no detector). Bump the version on every release.
- **Playback:** `bin/icestream-play.sh` → `exec mpv --no-config --ytdl=no` (from PATH; the user's mpv config/scripts must not affect IceStream, and a dead mount fails in ~0.5 s instead of ~2.3 s via yt-dlp; no back-buffer, 4 MiB read-ahead since there is no seeking) on the Icecast listen URL (`http://wxradio.org:8000/<mount>`). Do **not** rewrite to `https://wxradio.org/<mount>` as the play URL; that failed in mpv even when curl GET worked. Icecast often **400s HEAD**; probe with GET.
- **Stop:** `bin/icestream-stop.sh` kills only this user's mpv tagged `--script-opts=icestream=1` (pattern anchored so argv[0] is mpv; `-u $(id -u)`) and waits until they exit. Called on stop, before every launch, once at Service start (orphans from an earlier shell), and detached (`Quickshell.execDetached`) on Service destruction. **No polling timer**: an earlier 1.5 s idle pkill loop cost a fork every 1.5 s forever and could kill freshly started streams.
- **Locate:** On panel open: weather.json coords if set; else the same IP lookup weather uses (`https://wttr.in/?format=j1` `nearest_area` lat/lon, e.g. Lombard). Typed US ZIP still wins. The weather *name* is a label only. Then `api.weather.gov/points/{lat},{lon}` (4 decimal places). `GET /points/…/radio` is SSML, not the stream.
- **Closest stations:** candidates are every transmitter whose SAME codes include the user's county (`/points` → `nwr.sameCode`), plus the covering one; fall back to the covering transmitter's SAME list if the point has no county code. Attach Icecast and Broadcastify by call sign. Rank by distance to NOAA **tower** coordinates (Broadcastify coordinates are only a fallback). KWO39's tower is downtown Chicago (41.8789, -87.6361) even though NWS lists its site city as Wood Dale.
- **Transmitter list:** `data/nwr-transmitters.json` (bundled, ~1,035 transmitters: SAME codes, frequency, site, status, tower lat/lon), generated by `node scripts/build-nwr-transmitters.mjs` from NOAA's county coverage data `https://www.weather.gov/source/nwr/JS/ccl-data.js` (parsed as JSON, never evaluated). The Service loads the bundle at startup and refetches the source at startup and daily (~180 KB compressed); a download only replaces data if it parses as complete (≥ 900 transmitters). Rerun the script before releases.
- **Do not use the NWS API `/radio` list:** every row is repeated ~64 times, so a 443 KB page of 500 rows holds only 8–9 transmitters; a full walk is ~130 pages / ~58 MB. `/radio/{callSign}` (single transmitter) is fine and is still the live fallback for the covering station.
- **Catalog refresh** (Icecast, hourly) keeps the last good list when a fetch fails or parses empty.
- **List ranking after locate:** `preferNearby` — overlapping call signs first, then same state, then the rest. Do not leave the raw Icecast order (AK/AZ/CA before IL).
- **Theme:** `Color` / `Style` singletons. Do not import `QtQuick.Effects` (Omarchy blackholes it; the bar icon vanished). Draw the radio with `QtQuick.Shapes`.
- **No spectrograph** in the popover (removed). Bar live mark only.

## Tests and validate

```sh
node --test tests/*.test.mjs
omarchy plugin validate .
bash scripts/check.sh        # both of the above + qmllint
bash scripts/integration.sh  # real Service + mpv + live endpoints (graphical session, network)
```

`scripts/integration.sh` copies the plugin to a temp dir with a different mpv tag and a temporary HOME, so it cannot stop real IceStream playback or touch saved state.

`omarchy plugin validate` checks the **manifest folder** (schema, id, kinds, entry points, no symlinks). Silent exit 0 is success. It does not run QML, mpv, or unit tests.

TDD lives in `lib/` + `tests/`. Write the failing test first.

## Stream coverage (growth path)

NOAA has ~1,000 VHF transmitters. Only volunteer Icecast relays are playable. wxradio.org is the main nexus (~120 live mounts when last counted). Missing cities (e.g. **KZZ81 Lockport**) are missing because nobody is encoding that dish to Icecast, not because the plugin failed to search.

### Do this, in order

1. **Keep wxradio.org as primary.** Refresh `https://wxradio.org/status-json.xsl` (HTTPS; its `listenurl`s are still the port-8000 play URLs). New mounts appear without a code change if they follow `ST-Name-CALL`.
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
- Losing the Process handle left mpv running; only `omarchy restart shell` stopped it. Now: the stop script kills tagged mpv on stop, before every launch, once at startup, and on destruction. Never add a polling kill loop (an old 1.5 s one forked forever and killed new streams, including test mpv from other copies).
- Omarchy hot reload does **not** load new plugin QML (no `Qt.clearComponentCache`; keepLoaded Service kept). Copying files to the installed plugin is not enough to test UI or Service changes: run `omarchy restart shell`.
- Quickshell 0.3.1 `Socket`: after one failed connect, setting `connected = true` again does nothing. Create a fresh Socket per attempt (Playback.qml does).
- `Qt.createComponent` of an edited file returns the cached old component; do not rely on hot reload in tests either.
- When testing mpv by hand while an IceStream is running, use a copy with a different tag/client name (`scripts/integration.sh` does), or the running plugin's stop script may kill it.
- `QtQuick.Effects` / `MultiEffect` is blocked in third-party plugins.
- `pkill -f` with an unanchored pattern also matches shells/editors whose command line contains the text. Keep the stop pattern anchored.
- Quickshell `Process`: `running = true` while running queues one re-run with the latest command; a process that fails to start emits only `runningChanged` (no `exited`). Handle exits in `onRunningChanged`.
- Covering transmitter from NWS may have **no** Icecast mount. Show that honestly; do not autoplay a distant same-state stream as if it were the local dish.
- Marketplace listing is optional and pins a snapshot. `preview.png` is in the repo. Once playback has stayed healthy in real use, submit at https://plugins.omarchy.org/publish.html (GitHub issue on `omacom/omarchy-plugin-marketplace`). `omarchy plugin add` from the repo URL is enough to distribute.

## Releasing

1. Bump `version` in `manifest.json` **and** `CODE` in `lib/version.js` (a test fails if they differ; the update notice depends on it).
2. Optionally refresh NOAA data: `node scripts/build-nwr-transmitters.mjs`.
3. `bash scripts/check.sh` and `bash scripts/integration.sh`.
4. Copy to the installed plugin, `omarchy restart shell`, try it in the bar.
5. Commit and push. Users get it with `omarchy plugin update` + `omarchy restart shell`.

## Install for other people

```sh
omarchy plugin add https://github.com/JohnicBoom/IceStream.git --enable
```
