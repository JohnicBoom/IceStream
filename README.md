# IceStream

Volunteer Icecast relays of NOAA Weather Radio in the Omarchy bar.

Directly stream broadcasts from [wxradio.org](https://wxradio.org). If a transmitter has no wxradio stream, IceStream may offer a [Broadcastify](https://www.broadcastify.com) listen page. Those must be used in a browser; they cannot be streamed inside the plugin.

This is **not** a dedicated NOAA Weather Radio receiver and is not for protection of life or property. Only a subset of NWR transmitters have a volunteer Icecast mount.

## Install

Omarchy 4. Review the source, then:

```sh
omarchy plugin add https://github.com/JohnicBoom/IceStream.git --enable
```

Needs `mpv`, `ffmpeg`, `curl`, and Node on PATH (all present on a stock Omarchy install).

Design notes: [docs/CONTEXT.md](docs/CONTEXT.md).

## Use

- Left-click the bar radio: open or close the popover
- Right-click: play/stop
- Middle-click: find the covering station from the Omarchy weather location, or from a ZIP/city
- Space in the popover: play/stop
- Escape: close
- **Browser-only**: Broadcastify listen page, when we have a known feed id

Closing the panel does not stop audio until you stop playback.

## Develop

```sh
cd IceStream
node --test tests/*.test.mjs
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" ui/*.qml
```

Or `bash scripts/check.sh`. Domain logic is tested first (`lib/`); QML is presentation.

## Remove

```sh
omarchy plugin remove io.github.johnicboom.icestream
rm -rf ~/.local/state/icestream ~/.cache/icestream
```
