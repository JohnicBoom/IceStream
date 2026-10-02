import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/locate.js" as Locate
import "../lib/match.js" as Match

// Finds the covering transmitter and Closest stations. Chain:
// ZIP (zippopotam) | weather.json | consented wttr.in -> NWS /points -> transmitter.
// The whole chain has one 20 second budget. Every chain carries the token
// it started with; stale results are ignored. Never touches playback.
Item {
  id: root

  required property var catalogs
  property bool consent: false

  property var locateOptions: []
  property string nearbyState: ""
  property var nearbyCallSigns: []
  property var lastOrigin: null
  // Kept so a catalog that arrives after the locate can be attached without
  // another network request. The panel opens both at once.
  property var locatedCovering: null
  property string locatedSameCode: ""
  property var weather: null
  property bool weatherReady: false
  property bool openWaiting: false
  property string queuedZip: ""
  property bool needsConsent: false
  property int locateToken: 0
  property real locateStarted: 0
  property string pendingCovering: ""
  property string pendingSameCode: ""

  readonly property string py: "/usr/bin/python3"
  readonly property string fetchScript: filePath(Qt.resolvedUrl("../bin/icestream-fetch.py"))
  readonly property string stateScript: filePath(Qt.resolvedUrl("../bin/icestream-state.py"))
  readonly property int bodyCap: 256 * 1024

  signal showMessage(string text)

  function filePath(url) {
    var s = String(url || "")
    return s.indexOf("file://") === 0 ? s.slice(7) : s
  }

  function beginLocate() {
    root.locateToken += 1
    root.locateStarted = Date.now()
    root.pendingCovering = ""
    root.pendingSameCode = ""
    root.needsConsent = false
    return root.locateToken
  }

  function secondsLeft() {
    var left = Math.floor((20000 - (Date.now() - root.locateStarted)) / 1000)
    if (left < 1) return 0
    if (left > 20) return 20
    return left
  }

  function runFetch(proc, op, args, token) {
    if (token !== root.locateToken) return
    var seconds = root.secondsLeft()
    if (seconds < 1) {
      root.showMessage("Location lookup timed out.")
      return
    }
    var cmd = [root.py, "-I", "-S", root.fetchScript, op]
    for (var i = 0; i < args.length; i++) cmd.push(String(args[i]))
    cmd.push(String(seconds))
    proc.fetch(cmd, token, root.bodyCap)
  }

  function readWeather() {
    weatherFetch.fetch([root.py, "-I", "-S", root.stateScript, "read-weather"], 1, 8192)
  }

  function applyWeather(text) {
    root.weather = Locate.parseWeatherLocation(text)
    var first = !root.weatherReady
    root.weatherReady = true
    if (first && root.openWaiting) root.finishOpen()
  }

  function finishOpen() {
    root.openWaiting = false
    var plan = Locate.openPlan(root.queuedZip, root.weather, root.consent)
    root.needsConsent = plan.kind === "consent"
    if (plan.kind === "skip" || plan.kind === "consent") return
    if (plan.kind === "coords") {
      if (root.sameOrigin(root.lastOrigin, plan) && root.locateOptions.length) return
      root.locateCoords(plan.latitude, plan.longitude, plan.label || "weather location")
      return
    }
    if (plan.kind === "network") {
      if (root.locateOptions.length) return
      root.locateFromNetwork()
    }
  }

  // On panel open: a typed ZIP is left alone. Otherwise weather, then a
  // consented network lookup, otherwise the panel asks.
  function locateOnOpen(zipText) {
    root.queuedZip = String(zipText || "")
    root.openWaiting = true
    if (!root.weatherReady) return
    root.finishOpen()
  }

  // Find-closest and middle-click. Returns the plan kind. "consent" means
  // nothing was requested.
  function locateQuery(zipText) {
    var parsed = Locate.parsePlaceQuery(zipText)
    if (parsed) {
      root.needsConsent = false
      root.locateZip(parsed.zip)
      return "zip"
    }
    if (!root.weatherReady) return "consent"
    var plan = Locate.queryPlan(zipText, root.weather, root.consent)
    if (plan.kind === "zip") {
      root.needsConsent = false
      root.locateZip(plan.zip)
      return "zip"
    }
    if (plan.kind === "coords") {
      root.needsConsent = false
      root.locateCoords(plan.latitude, plan.longitude, plan.label || "weather location")
      return "coords"
    }
    if (plan.kind === "network") {
      root.locateFromNetwork()
      return "network"
    }
    root.needsConsent = true
    return "consent"
  }

  function sameOrigin(a, b) {
    if (!a || !b) return false
    return Math.abs(Number(a.latitude) - Number(b.latitude)) < 0.00015 &&
      Math.abs(Number(a.longitude) - Number(b.longitude)) < 0.00015
  }

  function locateZip(zip) {
    var token = root.beginLocate()
    root.showMessage("Looking up " + zip + "…")
    root.runFetch(zipFetch, "zip", [zip], token)
  }

  function locateFromNetwork() {
    var token = root.beginLocate()
    root.showMessage("Finding covering station from network location…")
    root.runFetch(wttrFetch, "wttr", [], token)
  }

  function locateCoords(lat, lon, label, token) {
    if (!token) token = root.beginLocate()
    var parts = Locate.nwsPointParts(lat, lon)
    if (!parts) {
      root.showMessage("Weather location is missing coordinates.")
      return
    }
    root.lastOrigin = { latitude: Number(parts.latitude), longitude: Number(parts.longitude) }
    root.showMessage("Finding covering station" + (label ? " for " + label : "") + "…")
    root.runFetch(pointsFetch, "points", [parts.latitude, parts.longitude], token)
  }

  function applyCovering(callSign, sameCode, token) {
    root.pendingSameCode = String(sameCode || "")
    if (root.catalogs.transmitterFor(callSign)) {
      root.finishCovering(callSign, root.pendingSameCode)
      return
    }
    var call = String(callSign || "").toUpperCase()
    if (!Locate.nwsRadioUrl(call)) {
      root.showMessage("No NOAA Weather Radio transmitter found.")
      return
    }
    root.pendingCovering = call
    root.showMessage("Looking up transmitter " + call + "…")
    root.runFetch(transmitterFetch, "radio", [call], token)
  }

  function finishCovering(callSign, sameCode) {
    var result = Match.resolveCovering(callSign, root.catalogs.transmitters, root.catalogs.streams)
    if (!result.station) {
      root.showMessage("No NOAA Weather Radio transmitter found.")
      return
    }
    var title = result.station.callSign
    if (result.station.siteName) title += " " + result.station.siteName
    if (result.station.siteCity && result.station.siteCity !== result.station.siteName)
      title += " (" + result.station.siteCity + ")"
    root.nearbyState = result.station.siteState || ""
    root.locatedCovering = result.station
    root.locatedSameCode = String(sameCode || "")
    root.applyOptions()
    var coveringOption = null
    for (var i = 0; i < root.locateOptions.length; i++) {
      if (root.locateOptions[i].covering) coveringOption = root.locateOptions[i]
    }
    var kind = Locate.optionKind(coveringOption || result.station)
    if (kind === "available") root.showMessage(title + " is the covering station (Available).")
    else root.showMessage(title + " is the covering station. No volunteer Icecast for it.")
  }

  // Rebuild the rows from the catalogs already in memory. Does not change the
  // covering message, so a late Icecast list cannot wipe "Connecting…".
  function applyOptions() {
    if (!root.locatedCovering) return
    root.locateOptions = Locate.buildLocateOptions({
      covering: root.locatedCovering,
      streams: root.catalogs.streams,
      transmitters: root.catalogs.transmitters,
      origin: root.lastOrigin,
      sameCode: root.locatedSameCode
    })
    var calls = []
    for (var i = 0; i < root.locateOptions.length; i++)
      calls.push(root.locateOptions[i].callSign)
    root.nearbyCallSigns = calls
  }

  onConsentChanged: {
    if (root.consent && root.needsConsent) root.locateFromNetwork()
  }

  Component.onCompleted: root.readWeather()

  FileView {
    id: weatherWatch
    path: (Quickshell.env("HOME") || "") + "/.local/state/omarchy/settings/weather.json"
    preload: false
    blockAllReads: true
    blockLoading: true
    watchChanges: true
    printErrors: false
    onFileChanged: root.readWeather()
  }

  Fetch {
    id: weatherFetch
    onDone: function(text, token) { root.applyWeather(text) }
  }

  Fetch {
    id: zipFetch
    onDone: function(text, token) {
      if (token !== root.locateToken) return
      var place = Locate.parseZipLookup(text)
      if (!place) {
        root.showMessage("Could not look up that ZIP code.")
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
        root.showMessage("Could not detect location. Enter a US ZIP code.")
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
        root.showMessage("NWS did not return a covering transmitter.")
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
      if (tx) root.catalogs.rememberTransmitter(tx)
      var callSign = (tx && tx.callSign) || root.pendingCovering
      root.pendingCovering = ""
      root.finishCovering(callSign, root.pendingSameCode)
    }
  }
}
