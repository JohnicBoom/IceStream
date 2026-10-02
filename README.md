# IceStream

Volunteer Icecast relays of NOAA Weather Radio in the Omarchy bar.

Directly stream broadcasts from [wxradio.org](https://wxradio.org). Only transmitters with a volunteer Icecast mount can be played. The rest are listed as Offline.

This is **not** a dedicated NOAA Weather Radio receiver and is not for protection of life or property. Only a subset of NWR transmitters have a volunteer Icecast mount.

![IceStream popover](preview.png)

## Install

Omarchy 4. Review the source, then:

```sh
omarchy plugin add https://github.com/JohnicBoom/IceStream.git --enable
```

Runtime needs **mpv**, **curl**, and **Python**. All three already ship with Omarchy: Python is installed because Omarchy depends on `uwsm`, and `uwsm` depends on `python`. IceStream does not ask you to install a package for it. It runs its own mpv with `--no-config`, so your personal mpv settings and scripts do not affect it.

## Update

```sh
omarchy plugin update com.johnicboom.icestream
omarchy restart shell
```

Omarchy keeps running the previous IceStream code until the shell restarts, so the new version only takes effect after `omarchy restart shell`. From 0.3.0 on, the bar tooltip and popover say when a restart is needed. The popover chip restarts the shell when clicked, and the running version stays in the bottom-right corner.

## Use

- Left-click the bar radio: open or close the popover
- Right-click: play/stop
- Middle-click: locate from a typed ZIP, or from Omarchy weather coordinates. If neither is set, the popover opens and waits. It does not send your IP address until you press **Use network location**
- Opening the panel locates the same way, and refreshes the live relay list and the NOAA transmitter file. Closing the panel does not schedule another download. The shell does not download those lists at startup
- ZIP field + **Find closest**: 5-digit US ZIP if you want a different place
- Space: play/stop (the last station)
- Up/Down or j/k: move through Closest stations and the relay list; Enter plays the highlighted row
- `/`: filter the relay list (Esc or Down goes back to the list)
- The stop button: stop while playing
- Escape: close

**Closest stations** lists the transmitter NWS says covers you plus every other transmitter NOAA lists for your county, working options first, then nearest tower. Each row is marked:

- **Available**: plays in IceStream
- **Offline**: no volunteer Icecast stream (clicking says so)

Below that, the full list of volunteer relays can be filtered by call sign, site, or state.

Closing the panel does not stop audio. Right-click the bar or press stop.

Volume in the popover is IceStream-only, so other apps can stay louder. It is remembered across restarts, along with the last station and the network-location choice, in `~/.local/state/icestream/state.json`.

IceStream talks to these addresses:

- `https://wxradio.org/status-json.xsl` — live relay list, when the panel opens. Playback stays on `http://wxradio.org:8000/<mount>`
- `https://www.weather.gov/source/nwr/JS/ccl-data.js` — NOAA transmitter file, when the panel opens. The copy shipped in the plugin is used until that refresh succeeds
- `https://api.zippopotam.us/us/<zip>` — when you look up a ZIP
- `https://api.weather.gov/points/<lat>,<lon>` — covering transmitter for a ZIP, for Omarchy weather coordinates, or for a consented network location. Omarchy's own weather location (read from `weather.json`, not requested by this plugin) also comes from api.weather.gov
- `https://api.weather.gov/radio/<call>` — one transmitter, only if it is not already in the NOAA list
- `https://wttr.in/?format=j1` — only after **Use network location**. That sends your IP address to wttr.in

## Develop

```sh
cd IceStream
node --test tests/*.test.mjs
omarchy plugin validate .
```

Node is only for tests. `bash scripts/check.sh` runs tests, `omarchy plugin validate`, and qmllint. `bash scripts/integration.sh` drives the real service (mpv, live endpoints) in a throwaway Quickshell; it needs a graphical session and network, and plays at volume 0.

`node scripts/build-nwr-transmitters.mjs` regenerates the bundled NOAA transmitter list (`data/nwr-transmitters.json`).

## Remove

```sh
omarchy plugin remove com.johnicboom.icestream
omarchy restart shell
```

That leaves `~/.local/state/icestream/state.json` in place (last station, volume, and network-location choice). Delete that file if you want those forgotten.
