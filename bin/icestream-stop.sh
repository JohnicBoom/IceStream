#!/usr/bin/env bash
# Kill only mpv processes this plugin started (see the tag in
# icestream-play.sh) and wait until they are gone, so a new mpv never
# overlaps an old one (the old one would unlink the shared IPC socket).
# No `set -e`: pgrep/pkill exit 1 when nothing matches. Always exit 0.
# Anchored so argv[0] must be mpv: an unanchored -f pattern also matches any
# shell or editor whose command line merely contains this text.
pattern='^([^ ]*/)?mpv .*--script-opts=icestream=1( |$)'
pkill -TERM -f "$pattern" >/dev/null 2>&1
for _ in $(seq 1 40); do
  pgrep -f "$pattern" >/dev/null 2>&1 || exit 0
  sleep 0.05
done
pkill -KILL -f "$pattern" >/dev/null 2>&1
exit 0
