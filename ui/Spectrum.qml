import QtQuick
import qs.Commons

Canvas {
  id: root
  property var bands: []
  property color barColor: Color.accent
  property color restColor: Color.popups.text
  property color strikeColor: Color.urgent
  property var shown: []
  property var bolts: []
  property int strikeWait: 0
  implicitHeight: Style.space(120)
  onBarColorChanged: requestPaint()
  onRestColorChanged: requestPaint()
  onStrikeColorChanged: requestPaint()
  onWidthChanged: requestPaint()
  onHeightChanged: requestPaint()

  function spoke(i, n) {
    return -Math.PI / 2 + (i / n) * Math.PI * 2
  }

  function makeBolt(cx, cy, rMin, rMax, values) {
    var n = 16
    var best = 0
    var bi = Math.floor(Math.random() * n)
    var i
    for (i = 0; i < n; i++) {
      var v = Number(i < values.length ? values[i] : 0)
      if (v > best) {
        best = v
        bi = i
      }
    }
    var a0 = spoke(bi, n) + (Math.random() - 0.5) * 0.35
    var a1 = a0 + (Math.random() - 0.5) * 0.5
    var r1 = rMin + Math.max(0.35, best) * (rMax - rMin) * (0.7 + Math.random() * 0.3)
    var pts = []
    var steps = 5 + Math.floor(Math.random() * 3)
    for (i = 0; i <= steps; i++) {
      var t = i / steps
      var wobble = (Math.random() - 0.5) * 0.28
      var ang = a0 + (a1 - a0) * t + wobble
      var rad = rMin + (r1 - rMin) * t
      pts.push({
        x: cx + Math.cos(ang) * rad,
        y: cy + Math.sin(ang) * rad
      })
    }
    var fork = null
    if (pts.length > 3 && Math.random() < 0.55) {
      var mid = 2 + Math.floor(Math.random() * (pts.length - 3))
      var base = pts[mid]
      var fang = spoke(bi, n) + (Math.random() - 0.5) * 0.9
      var fr = rMin + best * (rMax - rMin) * (0.45 + Math.random() * 0.35)
      fork = [
        base,
        {
          x: base.x + Math.cos(fang) * (fr * 0.25),
          y: base.y + Math.sin(fang) * (fr * 0.25)
        },
        {
          x: cx + Math.cos(fang) * fr,
          y: cy + Math.sin(fang) * fr
        }
      ]
    }
    return { pts: pts, fork: fork, life: 1 }
  }

  Timer {
    interval: 50
    running: true
    repeat: true
    onTriggered: {
      var target = root.bands || []
      var temporal = []
      var i
      var energy = 0
      for (i = 0; i < 16; i++) {
        var t = Number(i < target.length ? target[i] : 0)
        if (!isFinite(t) || t < 0) t = 0
        if (t > 1) t = 1
        var s = Number(i < root.shown.length ? root.shown[i] : 0)
        if (!isFinite(s)) s = 0
        if (t > s) temporal[i] = s + (t - s) * 0.12
        else temporal[i] = s * 0.92
        energy += temporal[i]
      }
      energy /= 16
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

      var live = []
      var bolts = root.bolts || []
      for (i = 0; i < bolts.length; i++) {
        var b = bolts[i]
        b.life -= 0.14
        if (b.life > 0) live.push(b)
      }
      if (root.strikeWait > 0) root.strikeWait -= 1
      else if (energy > 0.08 && Math.random() < 0.12 + energy * 0.25) {
        var cx = root.width / 2
        var cy = root.height / 2
        var rMax = Math.min(root.width, root.height) / 2 - 2
        var rMin = Math.max(4, rMax * 0.14)
        live.push(root.makeBolt(cx, cy, rMin, rMax, next))
        root.strikeWait = 6 + Math.floor(Math.random() * 8)
      }
      root.bolts = live
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
    ctx.globalAlpha = 0.1
    ctx.strokeStyle = root.restColor
    ctx.lineWidth = 1
    ctx.stroke()

    for (i = 0; i < n; i++) {
      v = i < values.length ? Number(values[i]) : 0
      if (!isFinite(v)) v = 0
      if (v < 0) v = 0
      if (v > 1) v = 1
      angle = root.spoke(i, n)
      r = rMin + v * (rMax - rMin)
      pts.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        v: v,
        angle: angle,
        r: r
      })
    }
    if (pts.length < 2) return

    function blobPath() {
      ctx.beginPath()
      ctx.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2)
      for (i = 0; i < n; i++) {
        var p = pts[i]
        var q = pts[(i + 1) % n]
        ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2)
      }
      ctx.closePath()
    }

    blobPath()
    var sky = ctx.createRadialGradient(cx, cy, rMin, cx, cy, rMax)
    sky.addColorStop(0, root.restColor)
    sky.addColorStop(0.35, root.barColor)
    sky.addColorStop(1, root.barColor)
    ctx.globalAlpha = 0.28
    ctx.fillStyle = sky
    ctx.fill()

    ctx.save()
    blobPath()
    ctx.clip()
    for (i = 0; i < n; i++) {
      var puff = pts[i]
      var pr = rMin + puff.v * (rMax - rMin) * (0.45 + 0.2 * Math.sin(i * 2.3))
      var px = cx + Math.cos(puff.angle) * pr
      var py = cy + Math.sin(puff.angle) * pr
      var size = (rMax - rMin) * (0.16 + 0.22 * puff.v)
      var pg = ctx.createRadialGradient(px, py, 0, px, py, size)
      pg.addColorStop(0, root.restColor)
      pg.addColorStop(0.55, root.barColor)
      pg.addColorStop(1, root.barColor)
      ctx.globalAlpha = 0.18 + 0.22 * puff.v
      ctx.fillStyle = pg
      ctx.beginPath()
      ctx.arc(px, py, size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, rMin * 1.35, 0, Math.PI * 2)
    ctx.globalAlpha = 0.35
    ctx.fillStyle = root.restColor
    ctx.fill()

    var bolts = root.bolts || []
    for (i = 0; i < bolts.length; i++) {
      var bolt = bolts[i]
      if (!bolt || !bolt.pts || bolt.pts.length < 2) continue
      ctx.globalAlpha = Math.max(0, bolt.life)
      ctx.strokeStyle = root.strikeColor
      ctx.lineWidth = 2.4
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.beginPath()
      ctx.moveTo(bolt.pts[0].x, bolt.pts[0].y)
      var k
      for (k = 1; k < bolt.pts.length; k++) ctx.lineTo(bolt.pts[k].x, bolt.pts[k].y)
      ctx.stroke()
      ctx.strokeStyle = root.restColor
      ctx.lineWidth = 1
      ctx.globalAlpha = Math.max(0, bolt.life * 0.85)
      ctx.stroke()
      if (bolt.fork && bolt.fork.length > 1) {
        ctx.strokeStyle = root.strikeColor
        ctx.lineWidth = 1.6
        ctx.globalAlpha = Math.max(0, bolt.life * 0.8)
        ctx.beginPath()
        ctx.moveTo(bolt.fork[0].x, bolt.fork[0].y)
        for (k = 1; k < bolt.fork.length; k++) ctx.lineTo(bolt.fork[k].x, bolt.fork[k].y)
        ctx.stroke()
      }
    }
    ctx.restore()

    blobPath()
    ctx.globalAlpha = 0.55
    ctx.strokeStyle = root.barColor
    ctx.lineWidth = 1.5
    ctx.lineJoin = "round"
    ctx.stroke()
  }
}
