#!/usr/bin/env bash
# Kill only mpv processes this plugin started (see the tag in
# icestream-play.sh) and wait until they are gone, so a new mpv never
# overlaps an old one (the old one would unlink the shared IPC socket).
# No `set -e`. Always exit 0. No pkill: walk this user's pids, require the
# exe to be mpv, and re-read start time immediately before the signal so a
# recycled pid is not killed. The literal icestream=1 below is what
# scripts/integration.sh rewrites.
# No polling timer: callers run this once per stop, launch, startup, and exit.
tag='icestream=1'
uid=$(id -u)

start_of() {
  local stat rest
  stat=$(cat "/proc/$1/stat" 2>/dev/null) || return 1
  rest=${stat##*)}
  printf '%s\n' "$rest" | awk '{print $20}'
}

matches() {
  local pid=$1 owner cmd exe
  owner=$(stat -c %u "/proc/$pid" 2>/dev/null) || return 1
  [ "$owner" = "$uid" ] || return 1
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null) || return 1
  case "$cmd" in
    mpv\ *" --script-opts=${tag} "*|mpv\ *" --script-opts=${tag}"|\
    */mpv\ *" --script-opts=${tag} "*|*/mpv\ *" --script-opts=${tag}") ;;
    *) return 1 ;;
  esac
  exe=$(readlink "/proc/$pid/exe" 2>/dev/null) || return 1
  exe=${exe% (deleted)}
  case "$exe" in
    */mpv) ;;
    *) return 1 ;;
  esac
  return 0
}

signal_one() {
  local sig=$1 pid=$2 st1 st2
  st1=$(start_of "$pid") || return 0
  matches "$pid" || return 0
  st2=$(start_of "$pid") || return 0
  [ -n "$st1" ] && [ "$st1" = "$st2" ] || return 0
  kill "-$sig" "$pid" 2>/dev/null || true
}

signal_all() {
  local sig=$1 pid
  for pid in /proc/[0-9]*; do
    pid=${pid##*/}
    matches "$pid" || continue
    signal_one "$sig" "$pid"
  done
}

any_left() {
  local pid
  for pid in /proc/[0-9]*; do
    pid=${pid##*/}
    if matches "$pid"; then
      return 0
    fi
  done
  return 1
}

signal_all TERM
i=0
while [ "$i" -lt 40 ]; do
  any_left || exit 0
  sleep 0.05
  i=$((i + 1))
done
signal_all KILL
exit 0
