import QtQuick
import Quickshell.Io

// One-shot command whose stdout is delivered exactly once per run through
// `done(text, token)`. Starting a new run finishes the old one with an empty
// body and its own token, so callers can ignore a stale result.
//
// stdout uses an empty split marker: Quickshell emits each chunk immediately
// and does not buffer until the process exits. Past `byteCap` characters the
// body is dropped and the process is signalled. A failed command reports
// empty text. The last stderr line and whether the process started are
// reported with it: a process that fails to start never emits `exited`.
// The Timer sits beside the Process because Process has no
// default property for child objects.
Item {
  id: root

  property int pendingToken: 0
  property int startedToken: 0
  property int byteCap: 0
  property string body: ""
  property string stderrText: ""
  property bool overflow: false
  readonly property bool running: proc.running

  signal done(string text, int token, string errorLine, bool started)

  function rememberStderr(chunk) {
    var next = root.stderrText + String(chunk || "")
    if (next.length > 1024) next = next.slice(next.length - 1024)
    root.stderrText = next
  }

  function stderrLine() {
    var parts = root.stderrText.split("\n")
    for (var i = parts.length - 1; i >= 0; i--) {
      if (parts[i]) return parts[i]
    }
    return ""
  }

  // Same sequencing as before: stop the old process, then start the new one.
  // The old run still reports, but with an empty body, because the buffer is
  // cleared first. Callers ignore a token that is no longer current.
  function fetch(args, token, cap) {
    root.pendingToken = token
    root.byteCap = cap
    root.body = ""
    root.stderrText = ""
    root.overflow = false
    killTimer.stop()
    proc.running = false
    proc.command = args
    proc.running = true
  }

  Process {
    id: proc
    stdinEnabled: false

    stdout: SplitParser {
      splitMarker: ""
      onRead: function(text) {
        if (root.overflow) return
        root.body += text
        if (root.byteCap > 0 && root.body.length > root.byteCap) {
          root.overflow = true
          root.body = ""
          proc.signal(15)
          killTimer.restart()
        }
      }
    }

    stderr: SplitParser {
      splitMarker: ""
      onRead: function(text) { root.rememberStderr(text) }
    }

    onStarted: {
      root.startedToken = root.pendingToken
      root.pendingToken = 0
    }

    onRunningChanged: {
      if (proc.running) return
      killTimer.stop()
      if (root.startedToken) {
        var token = root.startedToken
        var text = root.overflow ? "" : root.body
        var line = root.stderrLine()
        root.startedToken = 0
        root.body = ""
        root.stderrText = ""
        root.overflow = false
        root.done(text, token, line, true)
      } else if (root.pendingToken) {
        // Failed to start: Process emits no `started`/`exited` in that case.
        var failed = root.pendingToken
        root.pendingToken = 0
        root.stderrText = ""
        root.done("", failed, "", false)
      }
    }
  }

  Timer {
    id: killTimer
    interval: 400
    onTriggered: if (proc.running) proc.signal(9)
  }
}
