#!/usr/bin/env bash
# Report the three programs IceStream runs. Stdout is one line each.
# A missing program prints an icestream: line. This script does not fetch
# or play anything.
if command -v mpv >/dev/null 2>&1; then
  printf 'mpv ok\n'
else
  printf 'icestream: mpv not found\n'
fi
if [ -x /usr/bin/python3 ]; then
  printf 'python ok\n'
else
  printf 'icestream: python not found\n'
fi
if [ -x /usr/bin/curl ]; then
  printf 'curl ok\n'
else
  printf 'icestream: curl not found\n'
fi
