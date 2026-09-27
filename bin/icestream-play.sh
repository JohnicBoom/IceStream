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
# --no-config: the user's mpv.conf, scripts, and key bindings must not change
#   IceStream playback. --ytdl=no: a dead Icecast mount should fail in
#   ~0.5 s, not after a yt-dlp attempt (~2.3 s).
# Cache: live stream with no seeking, so keep no back-buffer and only a
#   small read-ahead instead of mpv's defaults (tens of MiB over hours).
exec "$mpv_bin" \
  --no-config \
  --ytdl=no \
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
  --demuxer-max-back-bytes=0 \
  --demuxer-max-bytes=4MiB \
  --volume="$vol" \
  -- "$url"
