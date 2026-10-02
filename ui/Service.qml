import QtQuick
import "../lib/locate.js" as Locate
import "../lib/match.js" as Match
import "../lib/version.js" as Version

// Keep-loaded service facade used by BarWidget and Panel. The work lives in
// Playback (mpv), Locator (covering + Closest stations), and Catalogs
// (Icecast mounts, NOAA transmitters).
Item {
  id: root

  // Injected by Omarchy.
  property var shell: null

  // Evaluated once when this instance is created; see lib/version.js.
  readonly property string codeVersion: Version.CODE
  readonly property string pluginId: "com.johnicboom.icestream"

  property string locateMessage: ""
  property string searchQuery: ""
  property string zipText: ""

  readonly property var playerState: playback.playerState
  readonly property bool playing: playback.playing
  readonly property bool connecting: playback.connecting
  readonly property var station: playback.station
  readonly property int volume: playback.volume
  readonly property bool needsNetworkConsent: locator.needsConsent

  readonly property var streams: catalogs.streams
  readonly property var transmitters: catalogs.transmitters
  readonly property var locateOptions: locator.locateOptions
  readonly property var visibleStreams: Match.preferNearby(Match.filterStreams(catalogs.streams, root.searchQuery), {
    state: locator.nearbyState,
    preferredCallSigns: locator.nearbyCallSigns
  })

  function playStation(station) { playback.playStation(station) }
  function togglePlay() { playback.togglePlay() }
  function stop() { playback.stop() }
  function setVolume(value) { playback.setVolume(value) }
  function locateClosest() { return locator.locateQuery(root.zipText) }
  function locateOnOpen() {
    catalogs.refreshOnOpen()
    locator.locateOnOpen(root.zipText)
  }
  function ensureCatalogs() { catalogs.refreshOnOpen() }
  function grantNetworkLocate() { playback.allowNetworkLocate() }

  function selectStream(stream) {
    playback.playStation(Match.stationFromStream(stream, catalogs.transmitters))
  }

  // Closest-stations row: play an Icecast mount, or explain why it cannot.
  function activateOption(option) {
    var action = Locate.optionAction(option)
    if (action === "play") playback.playStation(option)
    else if (option) root.locateMessage = option.callSign + " has no volunteer Icecast stream right now."
  }

  Catalogs { id: catalogs }

  Locator {
    id: locator
    catalogs: catalogs
    consent: playback.networkLocate
    onShowMessage: function(text) { root.locateMessage = text }
  }

  Playback {
    id: playback
    onShowMessage: function(text) { root.locateMessage = text }
    onClearMessage: function(text) { if (root.locateMessage === text) root.locateMessage = "" }
  }
}
