pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/catalog.js" as Catalog
import "../lib/locate.js" as Locate
import "../lib/match.js" as Match
import "../lib/player.js" as Player
import "../lib/mpv.js" as Mpv
import "../lib/broadcastify.js" as Broadcastify
import "../lib/nwr.js" as Nwr

Item {
  id: root
  property var shell: null
  property var playerState: Player.initialState()
  property var streams: []
  property var transmitters: []
  property string locateMessage: ""
  property string searchQuery: ""
  property string zipText: ""
  property var broadcastifyCatalog: []
  property string nearbyState: ""
  property var nearbyCallSigns: []
  property var lastOrigin: null
  property var locateOptions: []
  property int volume: 75

  // Locate: every lookup chain carries the token it started with; results
  // for an older token are ignored.
  property int locateToken: 0
  property string pendingCovering: ""
  property string pendingSameCode: ""

  // Playback: one mpv at a time. A launch waits until the stop script and
  // any previous mpv have exited. mpvToken is the playToken of the mpv that
  // is (or is about to be) running; 0 when none.
  property var pendingLaunch: null
  property int mpvToken: 0
  property int ipcAttempts: 0
  property var mpvIpc: null
  property bool ipcConnected: false
  property string connectingMessage: ""
  property bool settingsLoaded: false

  readonly property string pluginId: "io.github.johnicboom.icestream"
  readonly property string userAgent: "IceStream (https://github.com/JohnicBoom/IceStream)"
  readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
  readonly property string ipcPath: runtimeDir + "/icestream.mpv.sock"
  readonly property string statePath: Quickshell.env("HOME") + "/.local/state/icestream/state.json"
  readonly property string playScript: filePath(Qt.resolvedUrl("../bin/icestream-play.sh"))
  readonly property string stopScript: filePath(Qt.resolvedUrl("../bin/icestream-stop.sh"))
  readonly property bool playing: playerState.status === "playing"
  readonly property bool connecting: playerState.status === "connecting"
  readonly property var station: playerState.station
  readonly property var visibleStreams: Match.preferNearby(Match.filterStreams(streams, searchQuery), {
    state: nearbyState,
    preferredCallSigns: nearbyCallSigns
  })
  readonly property string broadcastifyDataPath: filePath(Qt.resolvedUrl("../data/broadcastify-nwr.json"))
  readonly property string transmittersDataPath: filePath(Qt.resolvedUrl("../data/nwr-transmitters.json"))

  function filePath(url) {
    var s = String(url || "")
    if (s.indexOf("file://") === 0) return s.slice(7)
    return s
  }

  // ---- settings -------------------------------------------------------

  function persist() {
    var payload = Player.serializeSettings(playerState.station, volume)
    persistProc.command = ["sh", "-c", "mkdir -p \"$HOME/.local/state/icestream\" && printf '%s\\n' \"$1\" > \"$HOME/.local/state/icestream/state.json\"", "icestream-state", payload]
    persistProc.running = true
  }

  function applySettings(raw) {
    if (root.settingsLoaded) return
    root.settingsLoaded = true
    var settings = Player.parseSettings(raw)
    if (settings.volume !== null) root.volume = settings.volume
    if (settings.station && root.playerState.status === "idle" && !root.playerState.station)
      root.playerState = Player.withStation(root.playerState, settings.station)
  }

  // ---- playback -------------------------------------------------------

  function playStation(station) {
    if (!station || !station.streamUrl) {
      locateMessage = station ? (station.callSign + " covers you, but no live stream is listed.") : "No station selected."
      return
    }
    if (Player.isActiveStream(playerState, station.streamUrl)) {
      stop()
      return
    }
    connectingMessage = "Connecting to " + station.callSign + "…"
    locateMessage = connectingMessage
    playerState = Player.play(playerState, station)
    persist()
    startMpv()
  }

  function togglePlay() {
    if (Player.isActive(playerState)) {
      stop()
      return
    }
    if (playerState.station && playerState.station.streamUrl) playStation(playerState.station)
  }

  function stop() {
    pendingLaunch = null
    playerState = Player.stop(playerState)
    if (locateMessage === connectingMessage) locateMessage = ""
    closeIpc()
    if (mpvProc.running) mpvProc.running = false
    killPlayback()
  }

  function startMpv() {
    pendingLaunch = {
      token: playerState.playToken,
      command: [playScript, ipcPath, playerState.station.streamUrl, String(volume)]
    }
    closeIpc()
    if (mpvProc.running) mpvProc.running = false
    killPlayback()
  }

  // Kills every IceStream mpv (including orphans from an earlier shell) and
  // waits for them to exit. A launch never starts while this runs, so the
  // pkill cannot hit a freshly started stream.
  function killPlayback() {
    if (!stopProc.running) stopProc.running = true
  }

  function launchPending() {
    if (!pendingLaunch || stopProc.running || mpvProc.running) return
    var launch = pendingLaunch
    pendingLaunch = null
    if (launch.token !== playerState.playToken || playerState.status !== "connecting") return
    mpvToken = launch.token
    ipcAttempts = 0
    mpvProc.command = launch.command
    mpvProc.running = true
  }

  function mpvGone() {
    var token = mpvToken
    mpvToken = 0
    closeIpc()
    if (pendingLaunch) {
      launchPending()
      return
    }
    if (!token || token !== playerState.playToken || !Player.isActive(playerState)) return
    var wasPlaying = playerState.status === "playing"
    var call = playerState.station ? playerState.station.callSign : "Stream"
    playerState = Player.playFail(playerState, token, wasPlaying ? "stream stopped" : "stream offline")
    locateMessage = wasPlaying
      ? call + " stream stopped."
      : call + " is Offline right now (the relay did not start)."
  }

  function markLive() {
    if (playerState.status !== "connecting" || mpvToken !== playerState.playToken) return
    playerState = Player.playAck(playerState, mpvToken)
    if (locateMessage === connectingMessage) locateMessage = ""
  }

  // A fresh Socket per attempt: after a failed connect (mpv has not created
  // its socket yet) Quickshell 0.3.1 ignores further `connected = true`.
  function openIpc() {
    closeIpc()
    mpvIpc = ipcComponent.createObject(root)
    if (mpvIpc) mpvIpc.connected = true
  }

  function closeIpc() {
    ipcConnected = false
    if (!mpvIpc) return
    var socket = mpvIpc
    mpvIpc = null
    socket.connected = false
    socket.destroy()
  }

  function ipcStateChanged(socket) {
    if (socket !== mpvIpc) return
    ipcConnected = socket.connected
    if (!ipcConnected) return
    socket.write(Mpv.observePlaybackCommand())
    socket.write(Mpv.setVolumeCommand(root.volume))
    socket.flush()
  }

  function sendIpc(line) {
    if (!ipcConnected || !mpvIpc) return
    mpvIpc.write(line)
    mpvIpc.flush()
  }

  function handleMpvLine(line) {
    if (Mpv.isPlaybackStarted(Mpv.parseLine(line))) markLive()
  }

  function setVolume(value) {
    var n = Player.clampVolume(value)
    if (n === null) return
    volume = n
    sendIpc(Mpv.setVolumeCommand(n))
    persistDebounce.restart()
  }

  // ---- stations and Broadcastify -------------------------------------

  function openBroadcastify(feed) {
    var url = feed && feed.url ? feed.url : Broadcastify.listenUrl(feed && feed.feedId)
    if (!url) return
    Qt.openUrlExternally(url)
  }

  function selectStream(stream) {
    playStation({
      callSign: stream.callSign,
      frequency: "",
      siteName: stream.siteName,
      siteCity: "",
      siteState: stream.state,
      streamUrl: stream.streamUrl,
      mount: stream.mount,
      alt: stream.alt
    })
  }

  // ---- locate ---------------------------------------------------------

  function beginLocate() {
    locateToken += 1
    pendingCovering = ""
    pendingSameCode = ""
    return locateToken
  }

  function locateZip(zip) {
    var token = beginLocate()
    locateMessage = "Looking up " + zip + "…"
    zipFetch.fetch(["curl", "-fsS", "--max-time", "8", "https://api.zippopotam.us/us/" + zip], token)
  }

  function locateCoords(lat, lon, label, token) {
    if (!token) token = beginLocate()
    lastOrigin = { latitude: Number(lat), longitude: Number(lon) }
    var url = Locate.nwsPointUrl(lat, lon)
    if (!url) {
      locateMessage = "Weather location is missing coordinates."
      return
    }
    locateMessage = "Finding covering station" + (label ? " for " + label : "") + "…"
    pointsFetch.fetch(["curl", "-fsSL", "--max-redirs", "3", "--max-time", "8", "-A", userAgent, "-H", "Accept: application/geo+json", url], token)
  }

  function weatherRaw() {
    try { return weatherFile.text() } catch (e) { return "" }
  }

  function locateQuery(text) {
    var parsed = Locate.parsePlaceQuery(text)
    if (parsed) {
      locateZip(parsed.zip)
      return
    }
    var weather = Locate.parseWeatherLocation(weatherRaw())
    if (weather.latitude !== null && weather.longitude !== null) {
      locateCoords(weather.latitude, weather.longitude, weather.name)
      return
    }
    locateFromNetwork()
  }

  function locateClosest() {
    locateQuery(zipText)
  }

  function locateFromNetwork() {
    var token = beginLocate()
    locateMessage = "Finding covering station from network location…"
    wttrFetch.fetch(["curl", "-fsS", "--max-time", "10", "https://wttr.in/?format=j1"], token)
  }

  function sameOrigin(a, b) {
    if (!a || !b) return false
    return Math.abs(Number(a.latitude) - Number(b.latitude)) < 0.00015 &&
      Math.abs(Number(a.longitude) - Number(b.longitude)) < 0.00015
  }

  function locateOnOpen() {
    if (Locate.parsePlaceQuery(zipText)) return
    var weather = Locate.parseWeatherLocation(weatherRaw())
    if (weather.latitude !== null && weather.longitude !== null) {
      if (sameOrigin(lastOrigin, weather) && locateOptions && locateOptions.length) return
      locateCoords(weather.latitude, weather.longitude, weather.name || "weather location")
      return
    }
    if (locateOptions && locateOptions.length) return
    locateFromNetwork()
  }

  function transmitterFor(callSign) {
    return Match.findTransmitter(transmitters, callSign)
  }

  function rememberTransmitter(tx) {
    if (!tx || !tx.callSign) return
    if (transmitterFor(tx.callSign)) return
    transmitters = transmitters.concat([tx])
  }

  function applyCovering(callSign, sameCode, token) {
    pendingSameCode = String(sameCode || "")
    if (transmitterFor(callSign)) {
      finishCovering(callSign, pendingSameCode)
      return
    }
    pendingCovering = String(callSign || "").toUpperCase()
    locateMessage = "Looking up transmitter " + pendingCovering + "…"
    transmitterFetch.fetch(["curl", "-fsS", "--max-time", "8", "-A", userAgent, "-H", "Accept: application/ld+json", "https://api.weather.gov/radio/" + pendingCovering], token)
  }

  // Updates the locate list only. Never touches playerState: locating must
  // not stop or replace what is playing.
  function finishCovering(callSign, sameCode) {
    var result = Match.resolveCovering(callSign, transmitters, streams)
    if (!result.station) {
      locateMessage = "No NOAA Weather Radio transmitter found."
      return
    }
    var title = result.station.callSign
    if (result.station.siteName) title += " " + result.station.siteName
    if (result.station.siteCity && result.station.siteCity !== result.station.siteName)
      title += " (" + result.station.siteCity + ")"
    nearbyState = result.station.siteState || ""
    locateOptions = Locate.buildLocateOptions({
      covering: result.station,
      streams: streams,
      broadcastify: broadcastifyCatalog,
      transmitters: transmitters,
      origin: lastOrigin,
      sameCode: sameCode
    })
    var calls = []
    var coveringOption = null
    for (var i = 0; i < locateOptions.length; i++) {
      calls.push(locateOptions[i].callSign)
      if (locateOptions[i].covering) coveringOption = locateOptions[i]
    }
    nearbyCallSigns = calls
    var kind = Locate.optionKind(coveringOption || result.station)
    if (kind === "available") {
      locateMessage = title + " is the covering station (Available)."
    } else if (kind === "browser-only") {
      locateMessage = title + " is the covering station (Browser-only)."
    } else {
      locateMessage = title + " is the covering station. No volunteer Icecast for it."
    }
  }

  // ---- catalogs -------------------------------------------------------

  function refreshStreams() {
    if (!icecastFetch.running)
      icecastFetch.fetch(["curl", "-fsS", "--max-time", "12", "-A", userAgent, Catalog.statusUrl], 1)
  }

  // NOAA's full transmitter list (SAME codes + tower coordinates). The
  // bundled copy loads at startup; this daily refresh only replaces it with
  // a download that parses as complete.
  function refreshTransmitters() {
    if (!nwrFetch.running)
      nwrFetch.fetch(["curl", "-fsS", "--compressed", "--max-time", "30", "-A", userAgent, Nwr.CCL_SOURCE], 1)
  }

  Component.onCompleted: {
    root.killPlayback()
    root.refreshStreams()
    root.refreshTransmitters()
  }
  // A child Process would be torn down with this object before pkill runs.
  Component.onDestruction: Quickshell.execDetached([root.stopScript])

  // Live Icecast mounts change often; the NWS transmitter list rarely.
  Timer {
    interval: 60 * 60 * 1000
    running: true
    repeat: true
    onTriggered: root.refreshStreams()
  }

  Timer {
    interval: 24 * 60 * 60 * 1000
    running: true
    repeat: true
    onTriggered: root.refreshTransmitters()
  }

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
    running: root.mpvToken !== 0 && mpvProc.running && !root.ipcConnected && root.ipcAttempts < 66
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

  FileView {
    id: weatherFile
    path: Quickshell.env("HOME") + "/.local/state/omarchy/settings/weather.json"
    watchChanges: true
    printErrors: false
  }

  FileView {
    id: broadcastifyFile
    path: root.broadcastifyDataPath
    watchChanges: true
    printErrors: false
    onLoaded: root.broadcastifyCatalog = Broadcastify.parseCatalog(text())
  }

  FileView {
    id: transmittersFile
    path: root.transmittersDataPath
    printErrors: false
    // Anything already known (a newer download, /radio/{call} lookups) wins.
    onLoaded: root.transmitters = Catalog.mergeByCallSign(root.transmitters, Nwr.parseBundle(text()))
  }

  FileView {
    id: stateFile
    path: root.statePath
    printErrors: false
    onLoaded: root.applySettings(text())
  }

  Process { id: persistProc }

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

  Process {
    id: mpvProc
    stdinEnabled: false
    // Exit handling lives here, not in onExited: a Process that fails to
    // start only emits runningChanged.
    onRunningChanged: if (!running) root.mpvGone()
  }

  Process {
    id: stopProc
    command: [root.stopScript]
    onRunningChanged: if (!running) root.launchPending()
  }

  Fetch {
    id: icecastFetch
    onDone: function(text, token) {
      var parsed = Catalog.parseIcecastStatus(text)
      if (parsed.length) root.streams = parsed
    }
  }

  Fetch {
    id: nwrFetch
    onDone: function(text, token) {
      var fresh = Nwr.parseCclData(text)
      if (Nwr.looksComplete(fresh)) root.transmitters = Catalog.mergeByCallSign(fresh, root.transmitters)
    }
  }

  Fetch {
    id: zipFetch
    onDone: function(text, token) {
      if (token !== root.locateToken) return
      var place = Locate.parseZipLookup(text)
      if (!place) {
        root.locateMessage = "Could not look up that ZIP code."
        return
      }
      root.locateCoords(place.latitude, place.longitude, place.city, token)
    }
  }

  Fetch {
    id: wttrFetch
    onDone: function(text, token) {
      if (token !== root.locateToken) return
      var place = Locate.parseWttrNearestArea(text)
      if (!place) {
        root.locateMessage = "Could not detect location. Enter a US ZIP code."
        return
      }
      root.locateCoords(place.latitude, place.longitude, place.name, token)
    }
  }

  Fetch {
    id: pointsFetch
    onDone: function(text, token) {
      if (token !== root.locateToken) return
      var point = Locate.parseNwsPoints(text)
      if (!point) {
        root.locateMessage = "NWS did not return a covering transmitter."
        return
      }
      root.applyCovering(point.transmitter, point.sameCode, token)
    }
  }

  Fetch {
    id: transmitterFetch
    onDone: function(text, token) {
      if (token !== root.locateToken) return
      var tx = Locate.parseNwsTransmitter(text)
      if (tx) root.rememberTransmitter(tx)
      var callSign = (tx && tx.callSign) || root.pendingCovering
      root.pendingCovering = ""
      // Without NWS metadata, resolveCovering still works from a stream.
      root.finishCovering(callSign, root.pendingSameCode)
    }
  }
}
