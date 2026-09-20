import QtQuick
import QtQuick.Controls
import Quickshell
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "io.github.johnicboom.nwsradiostream"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  readonly property var radio: hostWidget && hostWidget.radioService ? hostWidget.radioService : null
  readonly property var station: radio ? radio.station : null
  readonly property bool playing: radio ? radio.playing : false
  readonly property color contentForeground: bar ? bar.foreground : Color.popups.text
  readonly property string contentFont: bar ? bar.fontFamily : Style.font.family

  function open() {
    if (radio && radio.setPanelOpen) radio.setPanelOpen(true)
    root.controller.show()
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
    })
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    if (radio && radio.setPanelOpen) radio.setPanelOpen(false)
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && typeof root.bar.setCenterHoverRevealSuppressed === "function")
      root.bar.setCenterHoverRevealSuppressed(!!value)
  }

  function statusLabel() {
    if (!radio || !radio.playerState) return "IDLE"
    var status = radio.playerState.status
    if (status === "playing") return "LIVE"
    if (status === "connecting") return "CONNECTING"
    if (status === "paused") return "PAUSED"
    if (status === "error") return "OFFLINE"
    return "IDLE"
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.hostWidget || root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    padding: Style.space(12)
    borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.space(2)))
    contentWidth: panel.fittedContentWidth(Style.space(320))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Keys.onPressed: function(event) {
        if (event.key === Qt.Key_Space) {
          if (root.radio) root.radio.togglePlay()
          event.accepted = true
        }
      }

      Flickable {
        id: scroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: content.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

      Column {
        id: content
        width: scroll.width
        spacing: Style.space(8)

        Row {
          width: parent.width
          spacing: Style.space(8)

          Column {
            width: parent.width - playButton.width - Style.space(8)
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: root.station && root.station.callSign ? root.station.callSign : "NWS Radio"
              color: root.contentForeground
              font.family: root.contentFont
              font.pixelSize: Style.font.subtitle
              font.bold: true
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: {
                if (!root.station) return "Choose a station"
                var bits = []
                if (root.station.siteName) bits.push(root.station.siteName)
                if (root.station.siteState) bits.push(root.station.siteState)
                if (root.station.frequency) bits.push(root.station.frequency + " MHz")
                bits.push(root.statusLabel())
                return bits.join(" · ")
              }
              color: root.contentForeground
              opacity: 0.7
              font.family: root.contentFont
              font.pixelSize: Style.font.body
              elide: Text.ElideRight
            }
          }

          Rectangle {
            id: playButton
            width: Style.space(36)
            height: Style.space(36)
            radius: Style.space(6)
            color: playMouse.containsMouse ? Style.hoverFillFor(root.contentForeground, Color.accent) : "transparent"
            border.width: 1
            border.color: Color.accent

            Text {
              anchors.centerIn: parent
              text: root.playing ? "⏸" : "▶"
              color: Color.accent
              font.pixelSize: Style.font.subtitle
            }

            MouseArea {
              id: playMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: if (root.radio) root.radio.togglePlay()
            }
          }
        }

        Spectrum {
          width: parent.width
          height: Style.space(48)
          bands: root.radio ? root.radio.bands : []
          barColor: Color.accent
          restColor: root.contentForeground
        }

        Text {
          width: parent.width
          visible: root.radio && root.radio.locateMessage !== ""
          text: root.radio ? root.radio.locateMessage : ""
          color: Color.accent
          font.family: root.contentFont
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }

        Column {
          width: parent.width
          spacing: Style.space(4)
          visible: root.radio && root.radio.broadcastifyFeeds && root.radio.broadcastifyFeeds.length > 0

          Text {
            width: parent.width
            text: "Broadcastify (opens in the browser)"
            color: root.contentForeground
            opacity: 0.7
            font.family: root.contentFont
            font.pixelSize: Style.font.bodySmall
          }

          Repeater {
            model: root.radio ? root.radio.broadcastifyFeeds : []
            delegate: Rectangle {
              required property var modelData
              readonly property bool offline: modelData.online === false
              width: content.width
              height: Style.space(28)
              radius: Style.space(4)
              opacity: offline ? 0.55 : 1
              color: bcfyMouse.containsMouse ? Style.hoverFillFor(root.contentForeground, Color.accent) : "transparent"
              border.width: 1
              border.color: offline ? root.contentForeground : Color.accent

              Text {
                anchors.centerIn: parent
                width: parent.width - Style.space(12)
                horizontalAlignment: Text.AlignHCenter
                text: {
                  var status = modelData.online === true ? "Live · " : (modelData.online === false ? "Offline · " : "")
                  return status + "Open " + modelData.callSign + (modelData.title ? " " + modelData.title : "") + " on Broadcastify"
                }
                color: offline ? root.contentForeground : Color.accent
                font.family: root.contentFont
                font.pixelSize: Style.font.bodySmall
                elide: Text.ElideRight
              }

              MouseArea {
                id: bcfyMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: if (root.radio) root.radio.openBroadcastify(modelData)
              }
            }
          }
        }

        Text {
          width: parent.width
          text: "Playable streams"
          color: root.contentForeground
          opacity: 0.7
          font.family: root.contentFont
          font.pixelSize: Style.font.bodySmall
        }

        TextField {
          id: searchField
          width: parent.width
          placeholderText: "Filter stations by call sign or state"
          foreground: root.contentForeground
          font.family: root.contentFont
          onTextChanged: if (root.radio) root.radio.searchQuery = text
        }

        ListView {
          id: stationList
          width: parent.width
          height: Style.space(140)
          clip: true
          model: root.radio ? root.radio.visibleStreams : []
          spacing: Style.space(2)

          delegate: Rectangle {
            required property var modelData
            width: stationList.width
            height: Style.space(28)
            radius: Style.space(4)
            color: rowMouse.containsMouse || (root.station && root.station.callSign === modelData.callSign)
              ? Style.hoverFillFor(root.contentForeground, Color.accent)
              : "transparent"

            Text {
              anchors.verticalCenter: parent.verticalCenter
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.margins: Style.space(6)
              text: modelData.callSign + "  " + modelData.siteName + ", " + modelData.state + (modelData.alt ? "  alt" : "")
              color: root.contentForeground
              font.family: root.contentFont
              font.pixelSize: Style.font.body
              elide: Text.ElideRight
            }

            MouseArea {
              id: rowMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: if (root.radio) root.radio.selectStream(modelData)
            }
          }
        }

        Row {
          width: parent.width
          spacing: Style.space(6)

          TextField {
            id: zipField
            width: parent.width - locateButton.width - Style.space(6)
            placeholderText: "Enter a ZIP code or city name"
            foreground: root.contentForeground
            font.family: root.contentFont
            onTextChanged: if (root.radio) root.radio.zipText = text
            Keys.onReturnPressed: if (root.radio) root.radio.locateClosest()
            Keys.onEnterPressed: if (root.radio) root.radio.locateClosest()
          }

          Rectangle {
            id: locateButton
            width: Style.space(92)
            height: zipField.height
            radius: Style.space(4)
            color: locateMouse.containsMouse ? Style.hoverFillFor(root.contentForeground, Color.accent) : "transparent"
            border.width: 1
            border.color: Color.accent

            Text {
              anchors.centerIn: parent
              text: "Find closest"
              color: Color.accent
              font.family: root.contentFont
              font.pixelSize: Style.font.body
            }

            MouseArea {
              id: locateMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: if (root.radio) root.radio.locateClosest()
            }
          }
        }

        Text {
          width: parent.width
          text: "Internet audio is volunteer-relayed. It is not a substitute for a dedicated NOAA Weather Radio receiver."
          color: root.contentForeground
          opacity: 0.55
          font.family: root.contentFont
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
        }
      }
      }
    }
  }
}
