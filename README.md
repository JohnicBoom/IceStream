# NWSRadioStream

NOAA Weather Radio in the Omarchy bar. Click the radio for a popover: pick a station, find the transmitter that covers a ZIP code, play/pause, and watch a theme-following spectrograph while the stream is open.

Internet audio comes from volunteer Icecast relays at [wxradio.org](https://wxradio.org). It is **not** a substitute for a dedicated NOAA Weather Radio receiver, and it is not for protection of life or property. Only a subset of NWR transmitters have a live stream.

Some transmitters also have a [Broadcastify](https://www.broadcastify.com) listen page. **Open on Broadcastify** opens that page in your browser. Live vs offline is a hand-maintained hint in the plugin catalog, not a live scrape. The plugin does not play, scrape, or re-stream Broadcastify audio.

## Install

Omarchy 4. Review the source, then:

```sh
omarchy plugin add https://github.com/johnicboom/nwsradiostream.git --enable
omarchy plugin enable io.github.johnicboom.nwsradiostream --section center --after omarchy.weather
```

Needs `mpv`, `ffmpeg`, `curl`, and Node on PATH (all present on a stock Omarchy install).

## Use

- Left-click the bar radio: open or close the popover
- Right-click: play/pause
- Middle-click: find the covering station from the Omarchy weather location, or from the last ZIP
- Space in the popover: play/pause
- Escape: close
- **Open on Broadcastify**: listen page for that call sign, when we have a known feed id

The spectrograph is only in the popover. Closing the panel does not stop audio.

## Develop

```sh
cd nwsradiostream
node --test tests/*.test.mjs
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" ui/*.qml
```

Or `bash scripts/check.sh`. Domain logic is tested first (`lib/`); QML is presentation.

## Remove

```sh
omarchy plugin remove io.github.johnicboom.nwsradiostream
rm -rf ~/.local/state/nwsradiostream ~/.cache/nwsradiostream
```
