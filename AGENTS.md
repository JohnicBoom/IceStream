# Agent notes

Read **docs/CONTEXT.md** before changing this plugin. That file is the shared project memory (architecture, stream sources, ToS, pitfalls, releasing).

- Source of truth for code: this git repo (`/home/john/Work/IceStream` on the author’s machine).
- The running Omarchy copy is a **separate folder** under `~/.config/omarchy/plugins/com.johnicboom.icestream` (plain copy, not a clone). Copy files there to test (`rsync -a --delete --exclude=.git ./ <that folder>/`), then **`omarchy restart shell`**: Omarchy's hot reload keeps running the old QML and the keepLoaded Service, so copied changes are not live until the restart.
- Domain logic in `lib/` (Node-tested); QML in `ui/` only wires processes and UI. Playback ordering belongs in `lib/transport.js`, not in `ui/Playback.qml`.
- Tests first: `node --test tests/*.test.mjs`. Before handing off: `bash scripts/check.sh` (tests + `omarchy plugin validate` + qmllint). For playback/locate changes also `bash scripts/integration.sh` (real mpv + live endpoints, isolated from real playback).
- Releases: bump `manifest.json` `version` and `lib/version.js` `CODE` together.
- Icecast only. Do not add Broadcastify (listen pages or audio); their terms forbid the way this plugin used them. Do not import `QtQuick.Effects`. Do not add polling kill loops.
- Play URL is the Icecast listenurl on port 8000, not the https://wxradio.org/ rewrite.
