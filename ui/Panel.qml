pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "../lib/version.js" as Version

Panel {
  id: root
  moduleName: "com.johnicboom.icestream"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  readonly property var radio: hostWidget && hostWidget.radioService ? hostWidget.radioService : null
  readonly property var station: radio ? radio.station : null
  readonly property bool playing: radio ? radio.playing : false
  readonly property color contentForeground: bar ? bar.foreground : Color.popups.text
  readonly property string contentFont: bar ? bar.fontFamily : Style.font.family

  // Keyboard cursor over one combined list: closest stations first, then
  // the filtered relay list. -1 means no row is highlighted. cursorKey is
  // the highlighted station's identity, so the highlight follows it when a
  // locate or filter reorders the rows (and clears if it disappears).
  property int cursorIndex: -1
  property string cursorKey: ""
  property bool returnPending: false
  readonly property var options: radio && radio.locateOptions ? radio.locateOptions : []
  readonly property var streamRows: radio && radio.visibleStreams ? radio.visibleStreams : []
  readonly property int optionCount: options.length
  readonly property int rowCount: optionCount + streamRows.length

  onOptionsChanged: root.cursorIndex = root.indexOfKey(root.cursorKey)
  onStreamRowsChanged: root.cursorIndex = root.indexOfKey(root.cursorKey)

  function keyAt(i) {
    if (i < 0 || i >= root.rowCount) return ""
    if (i < root.optionCount) return "option:" + root.options[i].callSign
    return "stream:" + root.streamRows[i - root.optionCount].streamUrl
  }

  function indexOfKey(key) {
    if (!key) return -1
    for (var i = 0; i < root.rowCount; i++) {
      if (root.keyAt(i) === key) return i
    }
    return -1
  }

  function setCursor(i) {
    root.cursorIndex = i
    root.cursorKey = root.keyAt(i)
  }

  function open() {
    if (root.hostWidget && root.hostWidget.checkForUpdate) root.hostWidget.checkForUpdate()
    root.controller.show()
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
      if (root.radio && root.radio.locateOnOpen) root.radio.locateOnOpen()
    })
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
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
    if (!radio || !radio.playerState) return "Idle"
    var status = radio.playerState.status
    if (status === "playing") return "Playing"
    if (status === "connecting") return "Connecting"
    if (status === "error") return "Offline"
    return "Idle"
  }

  function isCurrentStream(streamUrl) {
    return !!(root.station && streamUrl && root.station.streamUrl === streamUrl)
  }

  function activateOption(opt) {
    if (root.radio && opt) root.radio.activateOption(opt)
  }

  function moveCursor(dy) {
    if (root.rowCount <= 0) return
    var next = root.cursorIndex < 0 ? (dy > 0 ? 0 : root.rowCount - 1) : root.cursorIndex + dy
    root.setCursor(Math.max(0, Math.min(root.rowCount - 1, next)))
    root.ensureCursorVisible()
  }

  function activateCursor() {
    var i = root.cursorIndex
    if (!root.radio || i < 0 || i >= root.rowCount) return false
    if (i < root.optionCount) root.activateOption(root.options[i])
    else root.radio.selectStream(root.streamRows[i - root.optionCount])
    return true
  }

  function ensureItemVisible(item) {
    if (!item) return
    var p = item.mapToItem(content, 0, 0)
    if (p.y < scroll.contentY) scroll.contentY = p.y
    else if (p.y + item.height > scroll.contentY + scroll.height)
      scroll.contentY = Math.min(p.y + item.height - scroll.height, Math.max(0, scroll.contentHeight - scroll.height))
  }

  function ensureCursorVisible() {
    var i = root.cursorIndex
    if (i < 0) return
    if (i < root.optionCount) {
      root.ensureItemVisible(optionRepeater.itemAt(i))
    } else {
      stationList.positionViewAtIndex(i - root.optionCount, ListView.Contain)
      root.ensureItemVisible(stationList)
    }
  }

  function focusList(cursor) {
    if (cursor !== undefined) {
      root.setCursor(cursor)
      root.ensureCursorVisible()
    }
    keyCatcher.forceActiveFocus()
  }

  function optionKindLabel(opt) {
    if (!opt) return "Offline"
    if (opt.streamUrl) return "Available"
    if (opt.broadcastifyUrl && opt.broadcastifyOnline !== false) return "Browser-only"
    return "Offline"
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
      // Text fields get every key while focused (Omarchy panel convention);
      // they hand focus back with Esc / Down.
      blocked: searchField.activeFocus || zipField.activeFocus
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onMoveRequested: function(dx, dy) { if (dy !== 0) root.moveCursor(dy) }
      // Return emits returnRequested then activateRequested; Space only the latter.
      onReturnRequested: root.returnPending = true
      onActivateRequested: {
        var fromReturn = root.returnPending
        root.returnPending = false
        if (fromReturn && root.activateCursor()) return
        if (root.radio) root.radio.togglePlay()
      }
      onTextKey: function(t) { if (t === "/") searchField.forceActiveFocus() }

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

        Text {
          width: parent.width
          visible: root.hostWidget !== null && root.hostWidget.serviceStale === true
          text: root.hostWidget ? root.hostWidget.restartNotice : ""
          color: Color.accent
          font.family: root.contentFont
          font.pixelSize: Style.font.body
          font.bold: true
          wrapMode: Text.WordWrap
        }

        Row {
          width: parent.width
          spacing: Style.space(8)

          Column {
            width: parent.width - (stopButton.visible ? stopButton.width + Style.space(8) : 0)
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: root.station && root.station.callSign ? root.station.callSign : "IceStream"
              color: root.contentForeground
              font.family: root.contentFont
              font.pixelSize: Style.font.subtitle
              font.bold: true
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              text: {
                if (!root.station) return "Volunteer Icecast relay"
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

          PanelActionButton {
            id: stopButton
            anchors.verticalCenter: parent.verticalCenter
            visible: root.playing || (root.radio !== null && root.radio.connecting)
            size: Style.space(36)
            iconText: "󰓛"
            tooltipText: "Stop"
            foreground: Color.accent
            hoverColor: Color.accent
            fontFamily: root.contentFont
            bordered: true
            onClicked: if (root.radio) root.radio.stop()
          }
        }

        Row {
          width: parent.width
          spacing: Style.space(8)
          Text {
            id: volLabel
            anchors.verticalCenter: parent.verticalCenter
            text: "Vol"
            color: root.contentForeground
            font.family: root.contentFont
            font.pixelSize: Style.font.bodySmall
          }
          // IceStream-only mpv volume (0-100), independent of system volume.
          PanelSlider {
            id: volSlider
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - volLabel.width - volPercent.width - parent.spacing * 2
            bar: root.bar
            minimum: 0
            maximum: 100
            step: 5
            integer: true
            value: root.radio ? root.radio.volume : 75
            onMoved: function(v) { if (root.radio) root.radio.setVolume(v) }
          }
          Text {
            id: volPercent
            anchors.verticalCenter: parent.verticalCenter
            width: Style.space(40)
            text: Math.round(volSlider.liveValue) + "%"
            color: root.contentForeground
            font.family: root.contentFont
            font.pixelSize: Style.font.bodySmall
            horizontalAlignment: Text.AlignRight
          }
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
          visible: root.radio && root.radio.locateOptions && root.radio.locateOptions.length > 0

          Text {
            width: parent.width
            text: "Closest stations"
            color: root.contentForeground
            opacity: 0.7
            font.family: root.contentFont
            font.pixelSize: Style.font.bodySmall
          }

          Repeater {
            id: optionRepeater
            model: root.options
            delegate: Rectangle {
              id: optionRow
              required property var modelData
              required property int index
              readonly property string kind: root.optionKindLabel(modelData)
              readonly property bool hasCursor: root.cursorIndex === index
              width: content.width
              height: Style.space(32)
              radius: Style.space(4)
              opacity: kind === "Offline" && !hasCursor ? 0.55 : 1
              color: optMouse.containsMouse || hasCursor ? Style.hoverFillFor(root.contentForeground, Color.accent) : "transparent"
              border.width: hasCursor ? 2 : 1
              border.color: kind === "Available" || hasCursor ? Color.accent : root.contentForeground

              Text {
                anchors.verticalCenter: parent.verticalCenter
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.margins: Style.space(8)
                text: (optionRow.modelData.covering ? "Covering · " : "") + optionRow.modelData.callSign + (optionRow.modelData.siteName ? " " + optionRow.modelData.siteName : "") + " · " + optionRow.kind
                color: optionRow.kind === "Offline" ? root.contentForeground : Color.accent
                font.family: root.contentFont
                font.pixelSize: Style.font.bodySmall
                elide: Text.ElideRight
              }

              MouseArea {
                id: optMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                  root.setCursor(optionRow.index)
                  root.activateOption(optionRow.modelData)
                }
              }
            }
          }
        }

        Text {
          width: parent.width
          text: "All volunteer Icecast relays"
          color: root.contentForeground
          opacity: 0.7
          font.family: root.contentFont
          font.pixelSize: Style.font.bodySmall
        }

        TextField {
          id: searchField
          width: parent.width
          placeholderText: "Filter stations  ( / )"
          foreground: root.contentForeground
          font.family: root.contentFont
          onTextChanged: if (root.radio) root.radio.searchQuery = text
          Keys.onPressed: function(event) {
            if (event.key === Qt.Key_Escape) {
              root.focusList()
              event.accepted = true
            } else if (event.key === Qt.Key_Down || event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
              root.focusList(root.streamRows.length ? root.optionCount : root.cursorIndex)
              event.accepted = true
            }
          }
        }

        ListView {
          id: stationList
          width: parent.width
          height: Style.space(140)
          clip: true
          model: root.streamRows
          spacing: Style.space(2)

          delegate: Rectangle {
            id: streamRow
            required property var modelData
            required property int index
            readonly property bool hasCursor: root.cursorIndex === root.optionCount + index
            width: stationList.width
            height: Style.space(28)
            radius: Style.space(4)
            color: rowMouse.containsMouse || hasCursor || root.isCurrentStream(modelData.streamUrl)
              ? Style.hoverFillFor(root.contentForeground, Color.accent)
              : "transparent"
            border.width: hasCursor ? 2 : 0
            border.color: Color.accent

            Text {
              anchors.verticalCenter: parent.verticalCenter
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.margins: Style.space(6)
              text: streamRow.modelData.callSign + "  " + streamRow.modelData.siteName + ", " + streamRow.modelData.state + (streamRow.modelData.alt ? "  alt" : "")
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
              onClicked: {
                root.setCursor(root.optionCount + streamRow.index)
                if (root.radio) root.radio.selectStream(streamRow.modelData)
              }
            }
          }
        }

        Row {
          width: parent.width
          spacing: Style.space(6)

          TextField {
            id: zipField
            width: parent.width - locateButton.width - Style.space(6)
            placeholderText: "US ZIP code"
            foreground: root.contentForeground
            font.family: root.contentFont
            onTextChanged: if (root.radio) root.radio.zipText = text
            Keys.onPressed: function(event) {
              if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                if (root.radio) root.radio.locateClosest()
                event.accepted = true
              } else if (event.key === Qt.Key_Escape) {
                root.focusList()
                event.accepted = true
              }
            }
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
          text: "IceStream plays volunteer Icecast relays from wxradio.org. Broadcastify links open in a browser and cannot be streamed here."
          color: root.contentForeground
          opacity: 0.55
          font.family: root.contentFont
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
        }

        // Running code version; shows the installed one too when a shell
        // restart is still needed to load it.
        Text {
          width: parent.width
          horizontalAlignment: Text.AlignRight
          text: {
            var installed = root.hostWidget ? root.hostWidget.installedVersion : ""
            if (installed && installed !== Version.CODE) return "v" + Version.CODE + " (v" + installed + " installed)"
            return "v" + Version.CODE
          }
          color: root.contentForeground
          opacity: 0.4
          font.family: root.contentFont
          font.pixelSize: Style.font.bodySmall
        }
      }
      }
    }
  }
}
