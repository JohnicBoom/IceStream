#!/usr/bin/env bash
# End-to-end check of the real Service (mpv, IPC, stop script, locate,
# catalogs) against live wxradio.org / NOAA / NWS. Needs a graphical
# session, network, quickshell, mpv, and curl. Plays at volume 0.
#
# Safety: the plugin is copied to a temp dir with a different mpv tag and
# audio client name, and runs with a temporary HOME, so it cannot stop your
# real IceStream playback or touch ~/.local/state/icestream.
set -uo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/home" "$work/plugin"
cp -r bin data lib ui manifest.json "$work/plugin/"
cp tests/integration/shell.qml "$work/shell.qml"
sed -i 's/icestream=1/icestream-test=1/g; s/--audio-client-name=IceStream/--audio-client-name=IceStreamTest/' \
  "$work/plugin/bin/icestream-play.sh" "$work/plugin/bin/icestream-stop.sh"
grep -q 'icestream-test=1' "$work/plugin/bin/icestream-stop.sh" || { echo "tag rewrite failed" >&2; exit 2; }
# Only after the tag rewrite. The unedited stop script matches a real IceStream.
trap 'if [ -f "$work/plugin/bin/icestream-stop.sh" ]; then "$work/plugin/bin/icestream-stop.sh"; fi; rm -rf "$work"' EXIT

HOME="$work/home" timeout 150 quickshell -p "$work/shell.qml" >"$work/run.log" 2>&1 </dev/null
grep -oE 'IT (step|PASS|FAIL).*' "$work/run.log"
if pgrep -u "$(id -u)" -f '^([^ ]*/)?mpv .*--script-opts=icestream-test=1( |$)' >/dev/null; then
  echo "IT FAIL: test mpv still running after exit"
  exit 1
fi
grep -q 'IT PASS' "$work/run.log"
