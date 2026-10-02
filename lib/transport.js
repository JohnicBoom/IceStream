// Pure playback sequencing. ui/Playback.qml feeds events in and performs the
// returned effects; this file decides what happens and in what order.
//
// Rules:
// - One mpv at a time. A launch waits until the stop script has exited AND
//   the previous mpv has exited, so the stop script can never hit a freshly
//   started stream and two mpv never share the IPC socket.
// - Only the latest requested launch runs (earlier pending ones are replaced).
// - `ended` is reported only when mpv exits with nothing queued; Playback.qml
//   decides whether that is a failure (it ignores it after an explicit stop).
//
// Events:  start | play {token, command} | stop | stopExited | mpvExited
// Effects: closeIpc | terminateMpv | runStop | launch {token, command} | ended {token}

function initial() {
  return { pending: null, mpvToken: 0, mpvRunning: false, stopRunning: false }
}

function copy(s) {
  return { pending: s.pending, mpvToken: s.mpvToken, mpvRunning: s.mpvRunning, stopRunning: s.stopRunning }
}

function runStop(s, effects) {
  if (s.stopRunning) return
  s.stopRunning = true
  effects.push({ type: "runStop" })
}

function tryLaunch(s, effects) {
  if (!s.pending || s.stopRunning || s.mpvRunning) return
  var launch = s.pending
  s.pending = null
  s.mpvToken = launch.token
  s.mpvRunning = true
  effects.push({ type: "launch", token: launch.token, command: launch.command })
}

function step(state, event) {
  var s = copy(state || initial())
  var effects = []
  var type = event && event.type
  if (type === "start") {
    runStop(s, effects)
  } else if (type === "play") {
    s.pending = { token: Number(event.token), command: event.command }
    effects.push({ type: "closeIpc" })
    if (s.mpvRunning) effects.push({ type: "terminateMpv" })
    runStop(s, effects)
  } else if (type === "stop") {
    s.pending = null
    effects.push({ type: "closeIpc" })
    if (s.mpvRunning) effects.push({ type: "terminateMpv" })
    runStop(s, effects)
  } else if (type === "stopExited") {
    s.stopRunning = false
    tryLaunch(s, effects)
  } else if (type === "mpvExited") {
    var token = s.mpvToken
    s.mpvToken = 0
    s.mpvRunning = false
    effects.push({ type: "closeIpc" })
    if (s.pending) tryLaunch(s, effects)
    else if (token) effects.push({ type: "ended", token: token })
  }
  return { state: s, effects: effects }
}

var api = { initial: initial, step: step }

if (typeof module !== "undefined" && module.exports) module.exports = api
