import QtQuick
import qs.Commons

Item {
  id: root
  property real peak: 0
  property color barColor: Color.accent
  property color restColor: Color.popups.text
  implicitHeight: Style.space(10)

  Rectangle {
    anchors.fill: parent
    radius: height / 2
    color: root.restColor
    opacity: 0.2
  }

  Rectangle {
    anchors.left: parent.left
    anchors.verticalCenter: parent.verticalCenter
    height: parent.height
    width: parent.width * Math.max(0, Math.min(1, root.peak * 10))
    radius: height / 2
    color: root.barColor
    Behavior on width { NumberAnimation { duration: 70 } }
  }
}
