# Agent notes

Read **docs/CONTEXT.md** before changing this plugin. That file is the shared project memory (architecture, stream sources, ToS, pitfalls).

- Source of truth for code: this git repo (`/home/john/Work/nwsradiostream` on the author’s machine).
- The running Omarchy copy is a **separate folder** under `~/.config/omarchy/plugins/io.github.johnicboom.nwsradiostream`. Copy files there to test; do not assume Work edits are live.
- Domain logic in `lib/`. Tests first: `node --test tests/*.test.mjs`.
- Do not play Broadcastify audio. Do not import `QtQuick.Effects`.
- Play URL is the Icecast listenurl on port 8000, not the https://wxradio.org/ rewrite.
