// mpv JSON IPC helpers. The Service writes these lines to mpv's
// --input-ipc-server socket through Quickshell.Io.Socket.

var PLAYBACK_OBSERVER_ID = 1

function command(args) {
  return JSON.stringify({ command: args }) + "\n"
}

function setVolumeCommand(volume) {
  var n = Math.round(Number(volume))
  if (!isFinite(n)) n = 0
  if (n < 0) n = 0
  if (n > 100) n = 100
  return command(["set_property", "volume", n])
}

// core-idle goes false once mpv is actually decoding audio (not while
// connecting or buffering). Silence on NWR still counts as playing.
function observePlaybackCommand() {
  return command(["observe_property", PLAYBACK_OBSERVER_ID, "core-idle"])
}

function parseLine(line) {
  try {
    var data = JSON.parse(String(line || "") || "null")
    return data && typeof data === "object" ? data : null
  } catch (e) {
    return null
  }
}

function isPlaybackStarted(event) {
  return !!event &&
    event.event === "property-change" &&
    event.name === "core-idle" &&
    event.data === false
}

var api = {
  command: command,
  setVolumeCommand: setVolumeCommand,
  observePlaybackCommand: observePlaybackCommand,
  parseLine: parseLine,
  isPlaybackStarted: isPlaybackStarted
}

if (typeof module !== "undefined" && module.exports) module.exports = api
