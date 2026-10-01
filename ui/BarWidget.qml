pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui
import qs.Commons
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
  readonly property string restartNotice: installedVersion && installedVersion !== runningVersion
    ? "IceStream " + installedVersion + " is installed. Run `omarchy restart shell` to finish updating."
    : "IceStream was updated. Run `omarchy restart shell` to finish."

  function checkForUpdate() {
    manifestFile.reload()
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

  FileView {
    id: manifestFile
    path: String(Qt.resolvedUrl("../manifest.json")).replace(/^file:\/\//, "")
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.installedVersion = Version.manifestVersion(text())
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
      if (root.playing) status = "Playing"
      else if (state && state.status === "connecting") status = "Connecting"
      else if (state && state.status === "error") status = "Offline"
      if (root.serviceStale) return root.restartNotice
      if (!station || !station.callSign) return "IceStream — volunteer Icecast relay"
      var bits = [station.callSign]
      if (station.siteName) bits.push(station.siteName)
      if (station.frequency) bits.push(station.frequency + " MHz")
      bits.push(status)
      return bits.join(" · ")
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
        if (root.radioService) root.radioService.locateClosest()
      } else {
        root.toggle()
      }
    }
  }
}
