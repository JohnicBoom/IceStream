import QtQuick
import qs.Commons

Canvas {
  id: root
  property var bands: []
  property color barColor: Color.accent
  property color restColor: Color.popups.text
  property var shown: []
  implicitHeight: Style.space(120)
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
        var l2 = temporal[(i + 14) % 16]
        var l1 = temporal[(i + 15) % 16]
        var c = temporal[i]
        var r1 = temporal[(i + 1) % 16]
        var r2 = temporal[(i + 2) % 16]
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
    var cx = width / 2
    var cy = height / 2
    var rMax = Math.min(width, height) / 2 - 2
    var rMin = Math.max(4, rMax * 0.14)
    var i
    var v
    var angle
    var r
    var pts = []

    ctx.beginPath()
    ctx.arc(cx, cy, rMax, 0, Math.PI * 2)
    ctx.globalAlpha = 0.12
    ctx.strokeStyle = root.restColor
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(cx, cy, rMin, 0, Math.PI * 2)
    ctx.globalAlpha = 0.2
    ctx.fillStyle = root.restColor
    ctx.fill()

    for (i = 0; i < n; i++) {
      v = i < values.length ? Number(values[i]) : 0
      if (!isFinite(v)) v = 0
      if (v < 0) v = 0
      if (v > 1) v = 1
      angle = -Math.PI / 2 + (i / n) * Math.PI * 2
      r = rMin + v * (rMax - rMin)
      pts.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r
      })
    }
    if (pts.length < 2) return

    ctx.beginPath()
    ctx.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2)
    for (i = 0; i < n; i++) {
      var p = pts[i]
      var q = pts[(i + 1) % n]
      ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2)
    }
    ctx.closePath()
    ctx.globalAlpha = 0.4
    ctx.fillStyle = root.barColor
    ctx.fill()
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = root.barColor
    ctx.lineWidth = 2
    ctx.lineJoin = "round"
    ctx.stroke()
  }
}
