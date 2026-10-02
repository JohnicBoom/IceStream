import QtQuick
import "../lib/catalog.js" as Catalog
import "../lib/locate.js" as Locate
import "../lib/match.js" as Match
import "../lib/nwr.js" as Nwr

// Reference data: the bundled NOAA list at startup, then the live Icecast
// mounts and the NOAA county file each time the panel opens. Nothing is
// downloaded at shell start and nothing is scheduled. A failed or
// incomplete refresh never replaces good data.
Item {
  id: root

  property var streams: []
  property var transmitters: []
  property bool freshTransmitters: false
  property string helperNotice: ""

  // A failed refresh never replaces a list that already loaded. The notice
  // is only for an empty list when Python or curl itself is missing.
  function noteHelper(started, errorLine) {
    if (root.streams.length) return
    var kind = Locate.helperFailure(started, errorLine)
    if (kind) root.helperNotice = Locate.helperMessage(kind)
  }

  readonly property string py: "/usr/bin/python3"
  readonly property string fetchScript: filePath(Qt.resolvedUrl("../bin/icestream-fetch.py"))
  readonly property string stateScript: filePath(Qt.resolvedUrl("../bin/icestream-state.py"))
  readonly property string bundlePath: filePath(Qt.resolvedUrl("../data/nwr-transmitters.json"))

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

  // Panel open, and the integration harness. Skip a download that is already running.
  function refreshOnOpen() {
    if (!icecastFetch.running)
      icecastFetch.fetch([root.py, "-I", "-S", root.fetchScript, "icecast"], 1, 512 * 1024)
    if (!nwrFetch.running)
      nwrFetch.fetch([root.py, "-I", "-S", root.fetchScript, "ccl"], 1, 2 * 1024 * 1024)
  }

  function applyBundle(text) {
    if (root.freshTransmitters) return
    var parsed = Nwr.parseBundle(text)
    if (!parsed.length) return
    root.transmitters = Catalog.mergeByCallSign(root.transmitters, parsed)
  }

  Component.onCompleted: {
    bundleFetch.fetch([root.py, "-I", "-S", root.stateScript, "read-bundle", root.bundlePath], 1, 512 * 1024)
  }

  Fetch {
    id: bundleFetch
    onDone: function(text, token) { root.applyBundle(text) }
  }

  Fetch {
    id: icecastFetch
    onDone: function(text, token, errorLine, started) {
      var parsed = Catalog.parseIcecastStatus(text)
      if (parsed.length) {
        root.streams = parsed
        root.helperNotice = ""
        return
      }
      root.noteHelper(started, errorLine)
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
