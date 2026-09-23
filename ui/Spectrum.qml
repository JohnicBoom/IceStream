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
    interval: 50
    running: true
    repeat: true
    onTriggered: {
      var target = root.bands || []
      var temporal = []
      var i
      for (i = 0; i < 16; i++) {
        var t = Number(i < target.length ? target[i] : 0)
        if (!isFinite(t) || t < 0) t = 0
        if (t > 1) t = 1
        var s = Number(i < root.shown.length ? root.shown[i] : 0)
        if (!isFinite(s)) s = 0
        if (t > s) temporal[i] = s + (t - s) * 0.12
        else temporal[i] = s * 0.92
      }
      var next = []
      for (i = 0; i < 16; i++) {
        var l2 = temporal[Math.max(0, i - 2)]
        var l1 = temporal[Math.max(0, i - 1)]
        var c = temporal[i]
        var r1 = temporal[Math.min(15, i + 1)]
        var r2 = temporal[Math.min(15, i + 2)]
        next[i] = l2 * 0.08 + l1 * 0.2 + c * 0.44 + r1 * 0.2 + r2 * 0.08
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
    var pts = []
    var i
    for (i = 0; i < n; i++) {
      var v = i < values.length ? Number(values[i]) : 0
      if (!isFinite(v)) v = 0
      if (v < 0) v = 0
      if (v > 1) v = 1
      pts.push({
        x: ((i + 0.5) / n) * width,
        y: height - Math.max(2, v * (height - 2))
      })
    }
    if (!pts.length) return

    ctx.beginPath()
    ctx.moveTo(0, height)
    ctx.lineTo(pts[0].x, pts[0].y)
    for (i = 0; i < n - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) / 2
      var my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y)
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.globalAlpha = 0.45
    ctx.fillStyle = root.barColor
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (i = 0; i < n - 1; i++) {
      mx = (pts[i].x + pts[i + 1].x) / 2
      my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y)
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = root.barColor
    ctx.lineWidth = 2
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.stroke()
  }
}
