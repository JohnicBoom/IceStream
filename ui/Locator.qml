import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/catalog.js" as Catalog
import "../lib/locate.js" as Locate
import "../lib/match.js" as Match

// Finds the covering transmitter and Closest stations. Chain:
// ZIP (zippopotam) | weather.json | IP (wttr.in) -> NWS /points -> transmitter.
// Every chain carries the token it started with; stale results are ignored.
// Never touches playback.
Item {
  id: root

  required property var catalogs

  property var locateOptions: []
  property string nearbyState: ""
  property var nearbyCallSigns: []
  property var lastOrigin: null
  property int locateToken: 0
  property string pendingCovering: ""
  property string pendingSameCode: ""

  signal showMessage(string text)

  function beginLocate() {
    root.locateToken += 1
    root.pendingCovering = ""
    root.pendingSameCode = ""
    return root.locateToken
  }

  function weatherRaw() {
    try { return weatherFile.text() } catch (e) { return "" }
  }

  // Typed ZIP wins, then Omarchy weather coordinates, then IP location.
  function locateQuery(zipText) {
    var parsed = Locate.parsePlaceQuery(zipText)
    if (parsed) {
      root.locateZip(parsed.zip)
      return
    }
    var weather = Locate.parseWeatherLocation(root.weatherRaw())
    if (weather.latitude !== null && weather.longitude !== null) {
      root.locateCoords(weather.latitude, weather.longitude, weather.name)
      return
    }
    root.locateFromNetwork()
  }

  // On panel open: skip if a ZIP is typed or the same place is already listed.
  function locateOnOpen(zipText) {
    if (Locate.parsePlaceQuery(zipText)) return
    var weather = Locate.parseWeatherLocation(root.weatherRaw())
    if (weather.latitude !== null && weather.longitude !== null) {
      if (root.sameOrigin(root.lastOrigin, weather) && root.locateOptions.length) return
      root.locateCoords(weather.latitude, weather.longitude, weather.name || "weather location")
      return
    }
    if (root.locateOptions.length) return
    root.locateFromNetwork()
  }

  function sameOrigin(a, b) {
    if (!a || !b) return false
    return Math.abs(Number(a.latitude) - Number(b.latitude)) < 0.00015 &&
      Math.abs(Number(a.longitude) - Number(b.longitude)) < 0.00015
  }

  function locateZip(zip) {
    var token = root.beginLocate()
    root.showMessage("Looking up " + zip + "…")
    zipFetch.fetch(["curl", "-fsS", "--max-time", "8", "https://api.zippopotam.us/us/" + zip], token)
  }

  function locateFromNetwork() {
    var token = root.beginLocate()
    root.showMessage("Finding covering station from network location…")
    wttrFetch.fetch(["curl", "-fsS", "--max-time", "10", "https://wttr.in/?format=j1"], token)
  }

  function locateCoords(lat, lon, label, token) {
    if (!token) token = root.beginLocate()
    root.lastOrigin = { latitude: Number(lat), longitude: Number(lon) }
    var url = Locate.nwsPointUrl(lat, lon)
    if (!url) {
      root.showMessage("Weather location is missing coordinates.")
      return
    }
    root.showMessage("Finding covering station" + (label ? " for " + label : "") + "…")
    pointsFetch.fetch(["curl", "-fsSL", "--max-redirs", "3", "--max-time", "8", "-A", Catalog.userAgent, "-H", "Accept: application/geo+json", url], token)
  }

  function applyCovering(callSign, sameCode, token) {
    root.pendingSameCode = String(sameCode || "")
    if (root.catalogs.transmitterFor(callSign)) {
      root.finishCovering(callSign, root.pendingSameCode)
      return
    }
    root.pendingCovering = String(callSign || "").toUpperCase()
    root.showMessage("Looking up transmitter " + root.pendingCovering + "…")
    transmitterFetch.fetch(["curl", "-fsS", "--max-time", "8", "-A", Catalog.userAgent, "-H", "Accept: application/ld+json", "https://api.weather.gov/radio/" + root.pendingCovering], token)
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
    root.locateOptions = Locate.buildLocateOptions({
      covering: result.station,
      streams: root.catalogs.streams,
      broadcastify: root.catalogs.broadcastifyCatalog,
      transmitters: root.catalogs.transmitters,
      origin: root.lastOrigin,
      sameCode: sameCode
    })
    var calls = []
    var coveringOption = null
    for (var i = 0; i < root.locateOptions.length; i++) {
      calls.push(root.locateOptions[i].callSign)
      if (root.locateOptions[i].covering) coveringOption = root.locateOptions[i]
    }
    root.nearbyCallSigns = calls
    var kind = Locate.optionKind(coveringOption || result.station)
    if (kind === "available") root.showMessage(title + " is the covering station (Available).")
    else if (kind === "browser-only") root.showMessage(title + " is the covering station (Browser-only).")
    else root.showMessage(title + " is the covering station. No volunteer Icecast for it.")
  }

  FileView {
    id: weatherFile
    path: Quickshell.env("HOME") + "/.local/state/omarchy/settings/weather.json"
    watchChanges: true
    printErrors: false
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
      // Without NWS metadata, resolveCovering still works from a stream.
      root.finishCovering(callSign, root.pendingSameCode)
    }
  }
}
