import QtQuick
import Quickshell.Io
import "../lib/catalog.js" as Catalog
import "../lib/match.js" as Match
import "../lib/broadcastify.js" as Broadcastify
import "../lib/nwr.js" as Nwr

// Reference data: live Icecast mounts (hourly), NOAA transmitters (bundled,
// refreshed daily), and the hand-maintained Broadcastify listen-page map.
// A failed or incomplete refresh never replaces good data.
Item {
  id: root

  property var streams: []
  property var transmitters: []
  property var broadcastifyCatalog: []
  property bool freshTransmitters: false

  function filePath(url) {
    var s = String(url || "")
    return s.indexOf("file://") === 0 ? s.slice(7) : s
  }

  function transmitterFor(callSign) {
    return Match.findTransmitter(root.transmitters, callSign)
  }

  // A single NWS /radio/{call} lookup; kept when a NOAA refresh replaces the list.
  function rememberTransmitter(tx) {
    if (!tx || !tx.callSign || root.transmitterFor(tx.callSign)) return
    var marked = {}
    for (var key in tx) marked[key] = tx[key]
    marked.lookedUp = true
    root.transmitters = root.transmitters.concat([marked])
  }

  function refreshStreams() {
    if (!icecastFetch.running)
      icecastFetch.fetch(["curl", "-fsS", "--max-time", "12", "-A", Catalog.userAgent, Catalog.statusUrl], 1)
  }

  function refreshTransmitters() {
    if (!nwrFetch.running)
      nwrFetch.fetch(["curl", "-fsS", "--compressed", "--max-time", "30", "-A", Catalog.userAgent, Nwr.CCL_SOURCE], 1)
  }

  Component.onCompleted: {
    root.refreshStreams()
    root.refreshTransmitters()
  }

  // Live Icecast mounts change often; the transmitter list rarely.
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

  FileView {
    path: root.filePath(Qt.resolvedUrl("../data/broadcastify-nwr.json"))
    watchChanges: true
    printErrors: false
    onLoaded: root.broadcastifyCatalog = Broadcastify.parseCatalog(text())
  }

  FileView {
    path: root.filePath(Qt.resolvedUrl("../data/nwr-transmitters.json"))
    printErrors: false
    // A NOAA download that already arrived is newer; otherwise merge, with
    // any /radio/{call} lookups winning.
    onLoaded: if (!root.freshTransmitters) root.transmitters = Catalog.mergeByCallSign(root.transmitters, Nwr.parseBundle(text()))
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
      if (!Nwr.looksComplete(fresh)) return
      root.freshTransmitters = true
      root.transmitters = Catalog.replaceTransmitters(fresh, root.transmitters)
    }
  }
}
