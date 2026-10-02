pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui
import qs.Commons
import "../lib/text.js" as TextLib
import "../lib/version.js" as Version

BarWidget {
  id: root
  moduleName: "com.johnicboom.icestream"

  readonly property var radioService: bar && bar.shell && bar.shell.serviceFor
    ? bar.shell.serviceFor(moduleName)
    : null
  readonly property bool playing: radioService ? radioService.playing : false
  // After a plugin update Omarchy keeps running the old code (widget from
  // Qt's component cache, keepLoaded Service) until the shell restarts; see
  // lib/version.js. Compare the manifest on disk with the running code.
  readonly property string runningVersion: Version.CODE
  property string installedVersion: ""
  readonly property bool serviceStale: Version.restartNeeded(installedVersion, radioService ? radioService.codeVersion : null)
  readonly property string restartNotice: Version.updateNotice(installedVersion)

  function restartShell() {
    Quickshell.execDetached(["omarchy", "restart", "shell"])
  }

  readonly property string manifestPath: String(Qt.resolvedUrl("../manifest.json")).replace(/^file:\/\//, "")
  readonly property string py: "/usr/bin/python3"
  readonly property string stateScript: String(Qt.resolvedUrl("../bin/icestream-state.py")).replace(/^file:\/\//, "")

  function checkForUpdate() {
    root.readManifest()
  }

  function readManifest() {
    manifestRead.fetch([root.py, "-I", "-S", root.stateScript, "read-manifest", root.manifestPath], 1, 8192)
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() {
    if (panelLoader.item && panelLoader.item.open) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  function toggle() {
    if (opened) close()
    else open()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item && panelLoader.item.closeForPopoutSwitch)
      panelLoader.item.closeForPopoutSwitch()
    else close()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()

  Component.onCompleted: root.readManifest()

  // Watch only. The bytes are read by the state helper, with a size cap.
  FileView {
    id: manifestWatch
    path: root.manifestPath
    preload: false
    blockAllReads: true
    blockLoading: true
    watchChanges: true
    printErrors: false
    onFileChanged: root.readManifest()
  }

  Fetch {
    id: manifestRead
    onDone: function(text, token) { root.installedVersion = Version.manifestVersion(text) }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    slotSize: Style.bar.statusSlot
    opticalSize: Style.bar.iconCanvas
    useActiveColor: false
    active: root.opened
    tooltipText: {
      var station = root.radioService ? root.radioService.station : null
      var state = root.radioService ? root.radioService.playerState : null
      var status = "Idle"
      var label = "IceStream — volunteer Icecast relay"
      if (root.playing) status = "Playing"
      else if (state && state.status === "connecting") status = "Connecting"
      else if (state && state.status === "error") status = "Offline"
      if (root.serviceStale) label = root.restartNotice
      else if (station && station.callSign) {
        var bits = [station.callSign]
        if (station.siteName) bits.push(station.siteName)
        if (station.frequency) bits.push(station.frequency + " MHz")
        bits.push(status)
        label = bits.join(" · ")
      }
      return TextLib.plain(label)
    }
    iconComponent: Component {
      RadioMark {
        anchors.centerIn: parent
        width: parent.width
        height: parent.height
        ink: button.foreground
        playing: root.playing
      }
    }
    onPressed: function(buttonCode) {
      if (!root.bar) return
      if (buttonCode === Qt.RightButton) {
        if (root.radioService) root.radioService.togglePlay()
      } else if (buttonCode === Qt.MiddleButton) {
        // No saved place and no consent: open the panel instead of sending the IP.
        // Middle-click itself does not refresh the catalogs.
        if (root.radioService && root.radioService.locateClosest() === "consent") root.open()
      } else {
        root.toggle()
      }
    }
  }
}
