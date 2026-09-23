import QtQuick
import qs.Commons

Canvas {
  id: root
  property var bands: []
  property color barColor: Color.accent
  property color restColor: Color.popups.text
  property var shown: []
  implicitHeight: Style.space(48)
  onBarColorChanged: requestPaint()
  onRestColorChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()

  Timer {
    interval: 33
    running: true
    repeat: true
    onTriggered: {
      var target = root.bands || []
      var next = []
      var i
      for (i = 0; i < 16; i++) {
        var t = Number(i < target.length ? target[i] : 0)
        if (!isFinite(t) || t < 0) t = 0
        if (t > 1) t = 1
        var s = Number(i < root.shown.length ? root.shown[i] : 0)
        if (!isFinite(s)) s = 0
        if (t > s) next[i] = s + (t - s) * 0.5
        else next[i] = s * 0.78
      }
      root.shown = next
      root.requestPaint()
    }
  }

  onPaint: {
    var ctx = getContext("2d")
    ctx.reset()
    var values = root.shown || []
    var n = 16
    var gap = Math.max(2, Math.floor(width * 0.03))
    var barWidth = (width - gap * (n - 1)) / n
    var radius = Math.min(3, barWidth / 3)
    var i
    for (i = 0; i < n; i++) {
      var v = i < values.length ? Number(values[i]) : 0
      if (!isFinite(v)) v = 0
      if (v < 0) v = 0
      if (v > 1) v = 1
      var h = Math.max(3, v * height)
      var x = i * (barWidth + gap)
      var y = height - h
      ctx.globalAlpha = 0.25 + 0.75 * v
      ctx.fillStyle = v > 0.04 ? root.barColor : root.restColor
      if (ctx.roundRect) {
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, h, radius)
        ctx.fill()
      } else {
        ctx.fillRect(x, y, barWidth, h)
      }
    }
  }
}
