import QtQuick
import QtQuick.Shapes

Item {
  id: root
  property color ink: "white"
  property bool playing: false
  implicitWidth: 16
  implicitHeight: 16

  readonly property real u: Math.min(width, height) / 24

  Shape {
    id: glyph
    anchors.fill: parent
    antialiasing: true
    preferredRendererType: Shape.CurveRenderer

    ShapePath {
      strokeColor: root.ink
      strokeWidth: Math.max(1.15, root.u * 1.45)
      capStyle: ShapePath.RoundCap
      fillColor: "transparent"
      startX: 4.2 * root.u
      startY: 8.6 * root.u
      PathLine { x: 17.8 * root.u; y: 2.6 * root.u }
    }

    ShapePath {
      fillColor: root.ink
      strokeWidth: 0
      startX: 5.3 * root.u
      startY: 8.6 * root.u
      PathArc {
        x: 3.1 * root.u
        y: 8.6 * root.u
        radiusX: 1.1 * root.u
        radiusY: 1.1 * root.u
        useLargeArc: true
      }
      PathArc {
        x: 5.3 * root.u
        y: 8.6 * root.u
        radiusX: 1.1 * root.u
        radiusY: 1.1 * root.u
        useLargeArc: true
      }
    }

    ShapePath {
      strokeColor: root.ink
      strokeWidth: Math.max(1.15, root.u * 1.45)
      fillColor: "transparent"
      joinStyle: ShapePath.RoundJoin
      capStyle: ShapePath.RoundCap
      startX: 4.0 * root.u
      startY: 10.2 * root.u
      PathLine { x: 20.0 * root.u; y: 10.2 * root.u }
      PathLine { x: 20.0 * root.u; y: 21.6 * root.u }
      PathLine { x: 4.0 * root.u; y: 21.6 * root.u }
      PathLine { x: 4.0 * root.u; y: 10.2 * root.u }
    }

    ShapePath {
      strokeColor: root.ink
      strokeWidth: Math.max(1.15, root.u * 1.45)
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      startX: 19.4 * root.u
      startY: 16.0 * root.u
      PathArc {
        x: 11.4 * root.u
        y: 16.0 * root.u
        radiusX: 4.0 * root.u
        radiusY: 4.0 * root.u
        useLargeArc: true
      }
      PathArc {
        x: 19.4 * root.u
        y: 16.0 * root.u
        radiusX: 4.0 * root.u
        radiusY: 4.0 * root.u
        useLargeArc: true
      }
    }

    ShapePath {
      strokeColor: root.ink
      strokeWidth: Math.max(1.15, root.u * 1.45)
      capStyle: ShapePath.RoundCap
      fillColor: "transparent"
      startX: 6.0 * root.u
      startY: 13.2 * root.u
      PathLine { x: 10.2 * root.u; y: 13.2 * root.u }
    }
    ShapePath {
      strokeColor: root.ink
      strokeWidth: Math.max(1.15, root.u * 1.45)
      capStyle: ShapePath.RoundCap
      fillColor: "transparent"
      startX: 6.0 * root.u
      startY: 16.0 * root.u
      PathLine { x: 10.2 * root.u; y: 16.0 * root.u }
    }
    ShapePath {
      strokeColor: root.ink
      strokeWidth: Math.max(1.15, root.u * 1.45)
      capStyle: ShapePath.RoundCap
      fillColor: "transparent"
      startX: 6.0 * root.u
      startY: 18.8 * root.u
      PathLine { x: 10.2 * root.u; y: 18.8 * root.u }
    }

  }

  Shape {
    anchors.fill: parent
    visible: root.playing
    antialiasing: true
    preferredRendererType: Shape.CurveRenderer

    ShapePath {
      strokeColor: root.ink
      strokeWidth: Math.max(1.05, root.u * 1.2)
      capStyle: ShapePath.RoundCap
      fillColor: "transparent"
      startX: 20.6 * root.u
      startY: 13.4 * root.u
      PathArc {
        x: 20.6 * root.u
        y: 18.6 * root.u
        radiusX: 3.4 * root.u
        radiusY: 3.4 * root.u
      }
    }
    ShapePath {
      strokeColor: root.ink
      strokeWidth: Math.max(1.05, root.u * 1.2)
      capStyle: ShapePath.RoundCap
      fillColor: "transparent"
      startX: 22.2 * root.u
      startY: 12.2 * root.u
      PathArc {
        x: 22.2 * root.u
        y: 19.8 * root.u
        radiusX: 5.2 * root.u
        radiusY: 5.2 * root.u
      }
    }
  }
}
