pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/player.js" as Player
import "../lib/transport.js" as Transport
import "../lib/mpv.js" as Mpv

// Playback: user-facing state (lib/player.js), process sequencing
// (lib/transport.js), mpv IPC, and saved settings (station + volume +
// network-location consent). This file only performs the effects
// transport.js returns.
Item {
  id: root

  property var playerState: Player.initialState()
  property var transport: Transport.initial()
  property int volume: 75
  property bool networkLocate: false
  property int ipcAttempts: 0
  property var mpvIpc: null
  property bool ipcConnected: false
  property string connectingMessage: ""
  property bool settingsLoaded: false
  property string pendingPayload: ""

  readonly property bool playing: playerState.status === "playing"
  readonly property bool connecting: playerState.status === "connecting"
  readonly property var station: playerState.station
  readonly property int mpvToken: transport.mpvToken

  readonly property string ipcPath: {
    var runtime = String(Quickshell.env("XDG_RUNTIME_DIR") || "")
    var prefix = "/run/user/"
    if (runtime.indexOf(prefix) !== 0) return ""
    var rest = runtime.slice(prefix.length)
    if (!/^[0-9]+$/.test(rest)) return ""
    return runtime + "/icestream.mpv.sock"
  }
  readonly property string py: "/usr/bin/python3"
  readonly property string stateScript: filePath(Qt.resolvedUrl("../bin/icestream-state.py"))
  readonly property string playScript: filePath(Qt.resolvedUrl("../bin/icestream-play.sh"))
  readonly property string stopScript: filePath(Qt.resolvedUrl("../bin/icestream-stop.sh"))

  signal showMessage(string text)
  signal clearMessage(string text)

  function filePath(url) {
    var s = String(url || "")
    return s.indexOf("file://") === 0 ? s.slice(7) : s
  }

  // ---- public ----------------------------------------------------------

  function playStation(station) {
    if (!station || !station.streamUrl) {
      root.showMessage(station ? (station.callSign + " has no live stream to play here.") : "No station selected.")
      return
    }
    if (!root.ipcPath) {
      root.showMessage("IceStream cannot find a per-user runtime directory.")
      return
    }
    if (Player.isActiveStream(root.playerState, station.streamUrl)) {
      root.stop()
      return
    }
    root.connectingMessage = "Connecting to " + station.callSign + "…"
    root.showMessage(root.connectingMessage)
    root.playerState = Player.play(root.playerState, station)
    root.persist()
    root.dispatch({
      type: "play",
      token: root.playerState.playToken,
      command: [root.playScript, root.ipcPath, station.streamUrl, String(root.volume)]
    })
  }

  function togglePlay() {
    if (Player.isActive(root.playerState)) {
      root.stop()
      return
    }
    if (root.playerState.station && root.playerState.station.streamUrl) {
      root.playStation(root.playerState.station)
      return
    }
    root.showMessage("Pick a station first. Available stations play here.")
  }

  function stop() {
    root.playerState = Player.stop(root.playerState)
    root.clearMessage(root.connectingMessage)
    root.dispatch({ type: "stop" })
  }

  function setVolume(value) {
    var n = Player.clampVolume(value)
    if (n === null) return
    root.volume = n
    root.sendIpc(Mpv.setVolumeCommand(n))
    persistDebounce.restart()
  }

  // Remembered opt-in for the wttr.in lookup. A click before the settings
  // file has loaded must not be overwritten by that later read.
  function allowNetworkLocate() {
    if (root.networkLocate) return
    root.networkLocate = true
    root.persist()
  }

  // ---- transport ---------------------------------------------------------

  function dispatch(event) {
    var result = Transport.step(root.transport, event)
    root.transport = result.state
    for (var i = 0; i < result.effects.length; i++) root.perform(result.effects[i])
  }

  function perform(effect) {
    if (effect.type === "closeIpc") {
      root.closeIpc()
    } else if (effect.type === "terminateMpv") {
      mpvProc.running = false
    } else if (effect.type === "runStop") {
      stopProc.running = true
    } else if (effect.type === "launch") {
      root.ipcAttempts = 0
      mpvProc.command = effect.command
      mpvProc.running = true
    } else if (effect.type === "ended") {
      root.streamEnded(effect.token)
    }
  }

  // mpv exited with nothing queued. After an explicit stop this is expected.
  function streamEnded(token) {
    if (token !== root.playerState.playToken || !Player.isActive(root.playerState)) return
    var wasPlaying = root.playerState.status === "playing"
    var call = root.playerState.station ? root.playerState.station.callSign : "Stream"
    root.playerState = Player.playFail(root.playerState, token, wasPlaying ? "stream stopped" : "stream offline")
    root.showMessage(wasPlaying
      ? call + " stream stopped."
      : call + " is Offline right now (the relay did not start).")
  }

  function markLive() {
    if (root.playerState.status !== "connecting" || root.mpvToken !== root.playerState.playToken) return
    root.playerState = Player.playAck(root.playerState, root.mpvToken)
    root.clearMessage(root.connectingMessage)
  }

  // ---- mpv IPC -------------------------------------------------------------

  // A fresh Socket per attempt: after a failed connect (mpv has not created
  // its socket yet) Quickshell 0.3.1 ignores further `connected = true`.
  function openIpc() {
    root.closeIpc()
    root.mpvIpc = ipcComponent.createObject(root)
    if (root.mpvIpc) root.mpvIpc.connected = true
  }

  function closeIpc() {
    root.ipcConnected = false
    if (!root.mpvIpc) return
    var socket = root.mpvIpc
    root.mpvIpc = null
    socket.connected = false
    socket.destroy()
  }

  function ipcStateChanged(socket) {
    if (socket !== root.mpvIpc) return
    root.ipcConnected = socket.connected
    if (!root.ipcConnected) return
    socket.write(Mpv.observePlaybackCommand())
    socket.write(Mpv.setVolumeCommand(root.volume))
    socket.flush()
  }

  function sendIpc(line) {
    if (!root.ipcConnected || !root.mpvIpc) return
    root.mpvIpc.write(line)
    root.mpvIpc.flush()
  }

  function handleMpvLine(line) {
    if (Mpv.isPlaybackStarted(Mpv.parseLine(line))) root.markLive()
  }

  // ---- settings ------------------------------------------------------------

  function persist() {
    if (!root.settingsLoaded) return
    root.pendingPayload = Player.serializeSettings(root.playerState.station, root.volume, root.networkLocate)
    stateWrite.command = [root.py, "-I", "-S", root.stateScript, "write-state"]
    if (stateWrite.running) stateWrite.running = false
    stateWrite.running = true
  }

  function applySettings(raw) {
    if (root.settingsLoaded) return
    var settings = Player.parseSettings(raw)
    if (settings.volume !== null) root.volume = settings.volume
    if (settings.station && root.playerState.status === "idle" && !root.playerState.station)
      root.playerState = Player.withStation(root.playerState, settings.station)
    var granted = root.networkLocate
    if (!root.networkLocate) root.networkLocate = settings.networkLocate === true
    root.settingsLoaded = true
    if (granted) root.persist()
  }

  // Kill orphans from an earlier shell once; no polling.
  Component.onCompleted: {
    root.dispatch({ type: "start" })
    stateRead.fetch([root.py, "-I", "-S", root.stateScript, "read-state"], 1, 8192)
  }
  // A child Process would be torn down with this object before the stop script runs.
  Component.onDestruction: Quickshell.execDetached([root.stopScript])

  Timer {
    id: persistDebounce
    interval: 600
    onTriggered: root.persist()
  }

  // Runs only while an mpv is starting and its IPC socket is not yet
  // connected (normally one or two ticks), and gives up after ~10 s.
  Timer {
    interval: 150
    repeat: true
    running: root.mpvToken !== 0 && root.transport.mpvRunning && !root.ipcConnected && root.ipcAttempts < 66
    onTriggered: {
      root.ipcAttempts += 1
      if (root.ipcAttempts >= 66) {
        // No IPC but mpv is still alive: better to show playing than hang.
        root.markLive()
        return
      }
      root.openIpc()
    }
  }

  Fetch {
    id: stateRead
    onDone: function(text, token) { root.applySettings(text) }
  }

  // stdin stays enabled: Quickshell cannot turn it back on after false.
  // One JSON line is written when the process starts. The helper stops at
  // the newline, because this pipe is never closed.
  Process {
    id: stateWrite
    stdinEnabled: true
    onStarted: stateWrite.write(root.pendingPayload + "\n")
  }

  Component {
    id: ipcComponent
    Socket {
      id: socket
      path: root.ipcPath
      parser: SplitParser {
        onRead: function(line) { root.handleMpvLine(line) }
      }
      onConnectionStateChanged: root.ipcStateChanged(socket)
    }
  }

  // Exit handling lives in onRunningChanged, not onExited: a Process that
  // fails to start only emits runningChanged.
  Process {
    id: mpvProc
    stdinEnabled: false
    onRunningChanged: if (!running) root.dispatch({ type: "mpvExited" })
  }

  Process {
    id: stopProc
    command: [root.stopScript]
    onRunningChanged: if (!running) root.dispatch({ type: "stopExited" })
  }
}
