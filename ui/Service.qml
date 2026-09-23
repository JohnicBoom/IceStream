import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/catalog.js" as Catalog
import "../lib/locate.js" as Locate
import "../lib/match.js" as Match
import "../lib/player.js" as Player
import "../lib/broadcastify.js" as Broadcastify

Item {
  id: root
  property var shell: null
  property var playerState: Player.initialState()
  property var streams: []
  property var transmitters: []
  property var bands: []
  property real playbackPeak: 0
  property bool panelOpen: false
  property string locateMessage: ""
  property string searchQuery: ""
  property string zipText: ""
  property string geocodeStateHint: ""
  property string pendingCovering: ""
  property bool stoppingMpv: false
  property var broadcastifyCatalog: []
  property var broadcastifyFeeds: []
  property string nearbyState: ""
  property var nearbyCallSigns: []
  property var lastOrigin: null
  property var locateOptions: []
  property int volume: 40
  readonly property string pluginId: "io.github.johnicboom.icestream"
  readonly property string userAgent: "IceStream (https://github.com/JohnicBoom/IceStream)"
  readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
  readonly property string ipcPath: runtimeDir + "/icestream.mpv.sock"
  readonly property string statePath: Quickshell.env("HOME") + "/.local/state/icestream/state.json"
  readonly property string analyzerPath: filePath(Qt.resolvedUrl("../bin/icestream-analyze.mjs"))
  readonly property string peakScript: filePath(Qt.resolvedUrl("../bin/icestream-peak.mjs"))
  readonly property string playScript: filePath(Qt.resolvedUrl("../bin/icestream-play.sh"))
  readonly property string stopScript: filePath(Qt.resolvedUrl("../bin/icestream-stop.sh"))
  property int mpvEpoch: 0
  readonly property bool playing: playerState.status === "playing"
  readonly property bool connecting: playerState.status === "connecting"
  readonly property var station: playerState.station
  readonly property var visibleStreams: Match.preferNearby(Match.filterStreams(streams, searchQuery), {
    state: nearbyState,
    preferredCallSigns: nearbyCallSigns
  })
  readonly property string broadcastifyDataPath: filePath(Qt.resolvedUrl("../data/broadcastify-nwr.json"))

  function filePath(url) {
    var s = String(url || "")
    if (s.indexOf("file://") === 0) return s.slice(7)
    return s
  }

  function setPanelOpen(open) {
    panelOpen = !!open
    syncAnalyzer()
  }

  function persist() {
    var payload = JSON.stringify({ station: playerState.station })
    persistProc.command = ["sh", "-c", "mkdir -p \"$HOME/.local/state/icestream\" && printf '%s\\n' \"$1\" > \"$HOME/.local/state/icestream/state.json\"", "icestream-state", payload]
    persistProc.running = true
  }

  function playStation(station) {
    if (!station || !station.streamUrl) {
      locateMessage = station ? (station.callSign + " covers you, but no live stream is listed.") : "No station selected."
      return
    }
    locateMessage = "Connecting to " + station.callSign + "…"
    playerState = Player.play(playerState, station)
    persist()
    startMpv()
    syncAnalyzer()
  }

  function markLive() {
    if (playerState.status !== "connecting") return
    playerState = Player.playAck(playerState, playerState.playToken)
    locateMessage = ""
    syncAnalyzer()
  }

  function startMpv() {
    mpvEpoch += 1
    var epoch = mpvEpoch
    stoppingMpv = true
    mpvProc.running = false
    mpvProc.command = [playScript, ipcPath, playerState.station.streamUrl, String(volume)]
    Qt.callLater(function() {
      if (epoch !== root.mpvEpoch) return
      root.stoppingMpv = false
      mpvProc.running = true
    })
  }

  function sendPause(paused) {
    ipcProc.command = ["python3", "-c", "import json,socket,sys\ns=socket.socket(socket.AF_UNIX)\ns.connect(sys.argv[1])\ns.sendall((json.dumps({\"command\":[\"set_property\",\"pause\", sys.argv[2]==\"1\"]})+\"\\n\").encode())\n", ipcPath, paused ? "1" : "0"]
    ipcProc.running = true
  }

  function togglePlay() {
    if (playerState.status === "playing" || playerState.status === "connecting" || playerState.status === "paused") {
      stop()
      return
    }
    if (playerState.station && playerState.station.streamUrl) playStation(playerState.station)
  }

  function setVolume(value) {
    var n = Math.round(Number(value))
    if (!isFinite(n)) return
    if (n < 0) n = 0
    if (n > 100) n = 100
    volume = n
    if (playing || connecting) sendVolume(n)
  }

  function sendVolume(n) {
    ipcProc.command = ["python3", "-c", "import json,socket,sys\ns=socket.socket(socket.AF_UNIX)\ns.connect(sys.argv[1])\ns.sendall((json.dumps({\"command\":[\"set_property\",\"volume\", int(sys.argv[2])]})+\"\\n\").encode())\n", ipcPath, String(n)]
    ipcProc.running = true
  }

  function killPlayback() {
    stopProc.running = false
    stopProc.command = [stopScript]
    stopProc.running = true
  }

  function stop() {
    stoppingMpv = true
    playerState = Player.stop(playerState)
    mpvProc.running = false
    killPlayback()
    syncAnalyzer()
  }

  function refreshBroadcastify(callSign, sameCodes) {
    broadcastifyFeeds = Broadcastify.overlappingFeeds(broadcastifyCatalog, callSign, sameCodes)
  }

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
    refreshBroadcastify(stream.callSign, [])
  }

  function locateZip(zip) {
    locateMessage = "Looking up " + zip + "…"
    zipProc.command = ["curl", "-fsS", "--max-time", "8", "https://api.zippopotam.us/us/" + zip]
    zipProc.running = true
  }

  function locateCity(name, state) {
    geocodeStateHint = state || ""
    locateMessage = "Looking up " + name + (state ? ", " + state : "") + "…"
    geocodeProc.command = ["curl", "-fsS", "--max-time", "8", "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(name) + "&count=8&language=en&format=json"]
    geocodeProc.running = true
  }

  function locateCoords(lat, lon, label) {
    lastOrigin = { latitude: Number(lat), longitude: Number(lon) }
    locateMessage = "Finding the covering station" + (label ? " for " + label : "") + "…"
    pointsProc.command = ["curl", "-fsS", "--max-time", "8", "-A", userAgent, "-H", "Accept: application/geo+json", "https://api.weather.gov/points/" + lat + "," + lon]
    pointsProc.running = true
  }

  function weatherRaw() {
    try { return weatherFile.text() } catch (e) { return "" }
  }

  function locateQuery(text) {
    var parsed = Locate.parsePlaceQuery(text)
    if (parsed && parsed.kind === "zip") {
      locateZip(parsed.zip)
      return
    }
    if (parsed && parsed.kind === "city") {
      locateCity(parsed.name, parsed.state)
      return
    }
    var weather = Locate.parseWeatherLocation(weatherRaw())
    if (weather.latitude !== null && weather.longitude !== null) {
      locateCoords(weather.latitude, weather.longitude, weather.name)
      return
    }
    locateMessage = "Enter a US ZIP code or a city, like Wood Dale, IL."
  }

  function locateClosest() {
    locateQuery(zipText)
  }

  function transmitterFor(callSign) {
    var needle = String(callSign || "").toUpperCase()
    for (var i = 0; i < transmitters.length; i++) {
      if (transmitters[i] && String(transmitters[i].callSign).toUpperCase() === needle)
        return transmitters[i]
    }
    return null
  }

  function rememberTransmitter(tx) {
    if (!tx || !tx.callSign) return
    if (transmitterFor(tx.callSign)) return
    transmitters = transmitters.concat([tx])
  }

  function applyCovering(callSign) {
    if (transmitterFor(callSign)) {
      finishCovering(callSign)
      return
    }
    pendingCovering = String(callSign || "").toUpperCase()
    locateMessage = "Looking up transmitter " + pendingCovering + "…"
    transmitterProc.command = ["curl", "-fsS", "--max-time", "8", "-A", userAgent, "-H", "Accept: application/ld+json", "https://api.weather.gov/radio/" + pendingCovering]
    transmitterProc.running = true
  }

  function finishCovering(callSign) {
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
    locateOptions = Locate.buildLocateOptions(result.station, streams, broadcastifyCatalog, lastOrigin)
    var calls = []
    var bcfy = []
    for (var i = 0; i < locateOptions.length; i++) {
      calls.push(locateOptions[i].callSign)
      if (locateOptions[i].broadcastifyUrl) {
        bcfy.push({
          callSign: locateOptions[i].callSign,
          title: locateOptions[i].siteName || "",
          url: locateOptions[i].broadcastifyUrl,
          online: locateOptions[i].broadcastifyOnline,
          feedId: 0
        })
      }
    }
    nearbyCallSigns = calls
    broadcastifyFeeds = bcfy
    var stopped = Player.stop(playerState)
    stopped.station = result.station
    playerState = stopped
    persist()
    var kind = Locate.optionKind(result.station)
    if (result.streamUrl) {
      locateMessage = title + " is the covering station (Available)."
    } else if (kind === "browser-only") {
      locateMessage = title + " is the covering station (Browser-only)."
    } else {
      locateMessage = title + " is the covering station. No volunteer Icecast for it."
    }
  }

  function refreshCatalog() {
    if (!icecastProc.running) {
      icecastProc.command = ["curl", "-fsS", "--max-time", "12", "-A", userAgent, "http://wxradio.org:8000/status-json.xsl"]
      icecastProc.running = true
    }
    if (!nwsProc.running) {
      nwsProc.command = ["curl", "-fsS", "--max-time", "12", "-A", userAgent, "-H", "Accept: application/ld+json", "https://api.weather.gov/radio"]
      nwsProc.running = true
    }
  }

  function syncAnalyzer() {
    var shouldRun = panelOpen && playing
    if (!shouldRun) {
      analyzerProc.running = false
      playbackPeak = 0
      return
    }
    analyzerProc.running = false
    analyzerProc.command = ["sh", "-c", "pw-cat --record --target icestream --format f32 --rate 8000 --channels 1 - 2>/dev/null | node \"$1\"", "icestream-peak", peakScript]
    Qt.callLater(function() { if (root.panelOpen && root.playing) analyzerProc.running = true })
  }

  Component.onCompleted: refreshCatalog()
  Component.onDestruction: root.killPlayback()

  Timer {
    interval: 60 * 60 * 1000
    running: true
    repeat: true
    onTriggered: root.refreshCatalog()
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
    id: stateFile
    path: root.statePath
    watchChanges: true
    printErrors: false
    onLoaded: {
      try {
        var data = JSON.parse(text() || "{}")
        if (data && data.station && root.playerState.status === "idle" && !root.playerState.station)
          root.playerState.station = data.station
      } catch (e) {}
    }
  }

  Process { id: persistProc }
  Process { id: ipcProc }

  Process {
    id: mpvProc
    stdinEnabled: false
    stderr: StdioCollector {
      id: mpvErr
      waitForEnd: true
    }
    onStarted: root.markLive()
    onRunningChanged: {
      if (running) root.markLive()
    }
    onExited: function(exitCode) {
      if (root.stoppingMpv) return
      if (mpvProc.running) return
      if (root.playerState.status === "idle" || root.playerState.status === "paused") return
      if (root.playerState.status === "connecting" || root.playerState.status === "playing") {
        root.playerState = Player.playFail(root.playerState, root.playerState.playToken, "Stream stopped.")
        var err = String(mpvErr.text || "").replace(/^\s+|\s+$/g, "")
        var name = root.station && root.station.callSign ? root.station.callSign : "that stream"
        root.locateMessage = err ? ("Could not play " + name + ": " + err) : ("Could not play " + name + ".")
        root.killPlayback()
      }
      root.syncAnalyzer()
    }
  }

  Process { id: stopProc }

  Timer {
    interval: 1500
    running: root.playerState.status === "idle" || root.playerState.status === "error"
    repeat: true
    onTriggered: root.killPlayback()
  }

  Timer {
    interval: 350
    running: root.connecting && mpvProc.running
    repeat: true
    onTriggered: root.markLive()
  }

  Process {
    id: analyzerProc
    stdinEnabled: false
    stdout: SplitParser {
      onRead: function(line) {
        try {
          var parsed = JSON.parse(line)
          if (parsed && typeof parsed.peak === "number") root.playbackPeak = parsed.peak
          if (parsed && parsed.bands) root.bands = parsed.bands
        } catch (e) {}
      }
    }
  }

  Process {
    id: icecastProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.streams = Catalog.parseIcecastStatus(text)
    }
  }

  Process {
    id: nwsProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.transmitters = Catalog.parseNwsRadioList(text).transmitters
    }
  }

  Process {
    id: zipProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var place = Locate.parseZipLookup(text)
        if (!place) {
          root.locateMessage = "Could not geocode that ZIP code."
          return
        }
        root.locateCoords(place.latitude, place.longitude, place.city)
      }
    }
    onExited: function(exitCode) {
      if (exitCode !== 0) root.locateMessage = "ZIP lookup failed."
    }
  }

  Process {
    id: geocodeProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var place = Locate.parseGeocodingResults(text, root.geocodeStateHint)
        if (!place) {
          root.locateMessage = "Could not find that city."
          return
        }
        root.locateCoords(place.latitude, place.longitude, place.name)
      }
    }
    onExited: function(exitCode) {
      if (exitCode !== 0) root.locateMessage = "City lookup failed."
    }
  }

  Process {
    id: transmitterProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var tx = Locate.parseNwsTransmitter(text)
        if (tx) root.rememberTransmitter(tx)
        var callSign = (tx && tx.callSign) || root.pendingCovering
        root.pendingCovering = ""
        root.finishCovering(callSign)
      }
    }
    onExited: function(exitCode) {
      if (exitCode !== 0) {
        var callSign = root.pendingCovering
        root.pendingCovering = ""
        if (callSign) root.finishCovering(callSign)
        else root.locateMessage = "Transmitter lookup failed."
      }
    }
  }

  Process {
    id: pointsProc
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var point = Locate.parseNwsPoints(text)
        if (!point) {
          root.locateMessage = "NWS did not return a covering transmitter."
          return
        }
        root.applyCovering(point.transmitter)
      }
    }
    onExited: function(exitCode) {
      if (exitCode !== 0) root.locateMessage = "NWS point lookup failed."
    }
  }
}
