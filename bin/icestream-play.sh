#!/usr/bin/env bash
# Start mpv as this process (exec). Do not pgrep/kill here: a failed pgrep
# under `set -e` once exited before mpv ran, which made every station Offline.
# Stopping is icestream-stop.sh's job; it matches the tag below.
sock=$1
url=$2
vol=${3:-75}
if [ -z "$sock" ] || [ -z "$url" ]; then
  echo "usage: icestream-play.sh <ipc-socket> <url> [volume]" >&2
  exit 2
fi
mpv_bin=$(command -v mpv) || { echo "icestream: mpv not found in PATH" >&2; exit 127; }
rm -f "$sock"
export PIPEWIRE_PROPS="{ application.name=IceStream }"
# --script-opts=icestream=1 is a harmless unique tag so icestream-stop.sh
# only ever kills mpv processes this plugin started.
exec "$mpv_bin" \
  --no-video \
  --no-terminal \
  --really-quiet \
  --input-terminal=no \
  --audio-client-name=IceStream \
  --script-opts=icestream=1 \
  --title=IceStream \
  --input-ipc-server="$sock" \
  --loop-playlist=inf \
  --network-timeout=15 \
  --cache=yes \
  --volume="$vol" \
  -- "$url"
