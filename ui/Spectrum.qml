import QtQuick
import qs.Commons

Canvas {
  id: root
  property var bands: []
  property color barColor: Color.accent
  property color restColor: Color.popups.text
  implicitHeight: Style.space(48)
  onBandsChanged: requestPaint()
  onBarColorChanged: requestPaint()
  onRestColorChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()

  onPaint: {
    var ctx = getContext("2d")
    ctx.reset()
    var values = root.bands || []
    var n = 16
    var gap = Math.max(1, Math.floor(width * 0.02))
    var barWidth = (width - gap * (n - 1)) / n
    var playing = false
    var i
    for (i = 0; i < values.length; i++) {
      if (Number(values[i]) > 0.02) playing = true
    }
    for (i = 0; i < n; i++) {
      var v = i < values.length ? Number(values[i]) : 0
      if (!isFinite(v)) v = 0
      if (v < 0) v = 0
      if (v > 1) v = 1
      var h = Math.max(2, v * height)
      ctx.fillStyle = playing ? root.barColor : root.restColor
      ctx.globalAlpha = playing ? 0.35 + 0.65 * v : 0.25
      ctx.fillRect(i * (barWidth + gap), height - h, barWidth, h)
    }
  }
}
