import QtQuick
import Quickshell.Io

// One-shot command whose stdout is delivered exactly once per run through
// `done(text, token)`. Starting a new run terminates the old one; the old
// run still reports with its own token so callers can ignore stale results.
// A failed command (curl -f, missing binary) reports empty text.
Process {
  id: root

  property int pendingToken: 0
  property int startedToken: 0

  signal done(string text, int token)

  function fetch(args, token) {
    root.pendingToken = token
    root.running = false
    root.command = args
    root.running = true
  }

  stdout: StdioCollector {
    id: out
    waitForEnd: true
  }

  onStarted: {
    root.startedToken = root.pendingToken
    root.pendingToken = 0
  }

  onRunningChanged: {
    if (root.running) return
    if (root.startedToken) {
      var token = root.startedToken
      root.startedToken = 0
      root.done(out.text, token)
    } else if (root.pendingToken) {
      // Failed to start: Process emits no `started`/`exited` in that case.
      var failed = root.pendingToken
      root.pendingToken = 0
      root.done("", failed)
    }
  }
}
