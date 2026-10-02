import QtQuick
import Quickshell
import "plugin/ui" as P

// Drives the real Service against live wxradio / NOAA / NWS endpoints.
// Run through scripts/integration.sh, which copies the plugin next to this
// file with a separate mpv tag and a temporary HOME. Prints "IT PASS" or
// "IT FAIL <step>: <reason>" and quits.
ShellRoot {
  id: harness

  property int stepIndex: -1
  property real stepStarted: 0
  property var firstStream: null
  property var secondStream: null
  property int ticks: 0

  function say(msg) { console.log("IT " + msg) }

  function fail(reason) {
    say("FAIL " + steps[stepIndex].name + ": " + reason)
    stepIndex = steps.length  // stop the driver
    Qt.quit()
  }

  function next() {
    stepIndex += 1
    if (stepIndex >= steps.length) {
      say("PASS")
      Qt.quit()
      return
    }
    stepStarted = Date.now()
    say("step " + steps[stepIndex].name)
    if (steps[stepIndex].action) steps[stepIndex].action()
  }

  readonly property var steps: [
    {
      name: "catalogs load (Icecast + NOAA bundle)",
      timeout: 25000,
      action: function() { svc.ensureCatalogs() },
      until: function() { return svc.streams.length > 1 && svc.transmitters.length >= 900 },
      after: function() {
        harness.firstStream = svc.streams[0]
        harness.secondStream = svc.streams[1]
        return ""
      }
    },
    {
      name: "play reaches Playing via mpv IPC",
      timeout: 20000,
      action: function() { svc.setVolume(0); svc.selectStream(harness.firstStream) },
      until: function() { return svc.playerState.status === "playing" },
      check: function() { return svc.playerState.status === "error" ? "stream went Offline" : "" }
    },
    {
      name: "switching streams reaches Playing with the new token",
      timeout: 20000,
      action: function() { svc.selectStream(harness.secondStream) },
      until: function() {
        return svc.playerState.status === "playing" && svc.station.streamUrl === harness.secondStream.streamUrl
      }
    },
    {
      name: "ZIP locate while playing lists Closest stations and keeps playing",
      timeout: 25000,
      action: function() { svc.zipText = "60191"; svc.locateClosest() },
      until: function() { return svc.locateOptions.length > 0 && svc.locateMessage.indexOf("covering station") !== -1 },
      after: function() {
        if (svc.playerState.status !== "playing") return "locate changed playback to " + svc.playerState.status
        var calls = svc.locateOptions.map(function(o) { return o.callSign })
        if (calls.indexOf("KWO39") === -1) return "KWO39 missing from " + JSON.stringify(calls)
        return ""
      }
    },
    {
      name: "stop returns to Idle",
      timeout: 5000,
      action: function() { svc.stop() },
      until: function() { return svc.playerState.status === "idle" }
    },
    {
      name: "a dead mount ends Offline with a message",
      timeout: 20000,
      action: function() {
        svc.playStation({ callSign: "ZZZ00", siteName: "Nowhere", streamUrl: "http://wxradio.org:8000/XX-Nowhere-ZZZ00" })
      },
      until: function() { return svc.playerState.status === "error" && svc.locateMessage.indexOf("Offline") !== -1 }
    }
  ]

  P.Service { id: svc }

  Timer {
    interval: 250
    repeat: true
    running: true
    onTriggered: {
      if (harness.stepIndex < 0) { harness.next(); return }
      if (harness.stepIndex >= harness.steps.length) return
      var step = harness.steps[harness.stepIndex]
      var problem = step.check ? step.check() : ""
      if (problem) { harness.fail(problem); return }
      if (step.until()) {
        var afterProblem = step.after ? step.after() : ""
        if (afterProblem) { harness.fail(afterProblem); return }
        harness.next()
        return
      }
      if (Date.now() - harness.stepStarted > step.timeout)
        harness.fail("timed out; status=" + svc.playerState.status + " message=" + svc.locateMessage)
    }
  }
}
