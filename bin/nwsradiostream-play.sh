#!/usr/bin/env bash
# Start mpv as this process (exec). Do not pgrep/kill: a failed pgrep
# under `set -e` used to exit before mpv ran, which made every station Offline.
sock=$1
url=$2
if [ -z "$sock" ] || [ -z "$url" ]; then
  echo "usage: nwsradiostream-play.sh <ipc-socket> <url>" >&2
  exit 2
fi
rm -f "$sock"
# Replace any previous plugin-owned mpv so play/stop cannot orphan a player.
pkill -f '/usr/bin/mpv .*--audio-client-name=nwsradiostream' >/dev/null 2>&1 || true
exec /usr/bin/mpv \
  --no-video \
  --no-terminal \
  --really-quiet \
  --input-terminal=no \
  --audio-client-name=nwsradiostream \
  --title=NWSRadioStream \
  --input-ipc-server="$sock" \
  --loop-playlist=inf \
  --cache=yes \
  -- "$url"
