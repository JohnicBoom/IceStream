import QtQuick
import Quickshell
import qs.Ui
import qs.Commons

BarWidget {
  id: root
  moduleName: "io.github.johnicboom.icestream"

  readonly property var radioService: bar && bar.shell && bar.shell.serviceFor
    ? bar.shell.serviceFor(moduleName)
    : null
  readonly property bool playing: radioService ? radioService.playing : false

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
      var status = root.playing ? "Playing" : (root.radioService && root.radioService.playerState && root.radioService.playerState.status === "connecting" ? "Connecting" : "Idle")
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
