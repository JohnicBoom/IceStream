#!/usr/bin/env bash
# Kill only mpv processes this plugin started. Always exit 0.
pkill -f '/usr/bin/mpv .*--audio-client-name=icestream' >/dev/null 2>&1 || true
exit 0
