import QtQuick
import qs.Commons

Canvas {
  id: root
  property var bands: []
  property color barColor: Color.accent
  property color restColor: Color.popups.text
  property real energy: 0
  implicitHeight: Style.space(96)
  onBarColorChanged: requestPaint()
  onRestColorChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()

  Timer {
    interval: 50
    running: true
    repeat: true
    onTriggered: {
      var target = root.bands || []
      var sum = 0
      var i
      var n = 0
      for (i = 0; i < target.length; i++) {
        var v = Number(target[i])
        if (!isFinite(v) || v < 0) v = 0
        if (v > 1) v = 1
        sum += v
        n += 1
      }
      var t = n > 0 ? sum / n : 0
      var s = root.energy
      if (t > s) root.energy = s + (t - s) * 0.1
      else root.energy = s * 0.94
      root.requestPaint()
    }
  }

  onPaint: {
    var ctx = getContext("2d")
    ctx.reset()
    var cx = width / 2
    var cy = height / 2
    var rMax = Math.min(width, height) / 2 - 3
    var e = root.energy
    if (!isFinite(e) || e < 0) e = 0
    if (e > 1) e = 1
    var r = rMax * (0.38 + 0.52 * e)
    var w = 1.6 + 1.4 * e

    ctx.beginPath()
    ctx.arc(cx, cy, rMax, 0, Math.PI * 2)
    ctx.globalAlpha = 0.14
    ctx.strokeStyle = root.restColor
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.globalAlpha = 0.35 + 0.55 * e
    ctx.strokeStyle = root.barColor
    ctx.lineWidth = w
    ctx.stroke()
  }
}
