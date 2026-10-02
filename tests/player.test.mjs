import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { test } from "node:test"

const require = createRequire(import.meta.url)
const player = require("../lib/player.js")

const phoenix = {
  callSign: "KEC94",
  streamUrl: "https://wxradio.org/AZ-Phoenix-KEC94"
}
const juneau = {
  callSign: "WXJ25",
  streamUrl: "https://wxradio.org/AK-Juneau-WXJ25"
}

test("initial state is idle with no station", () => {
  const state = player.initialState()
  assert.equal(state.status, "idle")
  assert.equal(state.station, null)
  assert.equal(state.playToken, 0)
  assert.equal(state.error, null)
})

test("play moves idle to connecting and issues a new token", () => {
  const next = player.play(player.initialState(), phoenix)
  assert.equal(next.status, "connecting")
  assert.equal(next.station.callSign, "KEC94")
  assert.equal(next.playToken, 1)
  assert.equal(next.error, null)
})

test("playAck with the current token becomes playing", () => {
  const connecting = player.play(player.initialState(), phoenix)
  const next = player.playAck(connecting, connecting.playToken)
  assert.equal(next.status, "playing")
})

test("playAck with a stale token is ignored", () => {
  const first = player.play(player.initialState(), phoenix)
  const second = player.play(first, juneau)
  const stale = player.playAck(second, first.playToken)
  assert.equal(stale.status, "connecting")
  assert.equal(stale.station.callSign, "WXJ25")
  assert.equal(stale.playToken, 2)
})

test("playFail with the current token becomes error", () => {
  const connecting = player.play(player.initialState(), phoenix)
  const next = player.playFail(connecting, connecting.playToken, "stream offline")
  assert.equal(next.status, "error")
  assert.equal(next.error, "stream offline")
  assert.equal(next.station.callSign, "KEC94")
})

test("playFail with a stale token is ignored", () => {
  const first = player.play(player.initialState(), phoenix)
  const playing = player.playAck(first, first.playToken)
  const switched = player.play(playing, juneau)
  const stale = player.playFail(switched, first.playToken, "old stream died")
  assert.equal(stale.status, "connecting")
  assert.equal(stale.station.callSign, "WXJ25")
  assert.equal(stale.error, null)
})

test("stop returns to idle but keeps the last station", () => {
  const connecting = player.play(player.initialState(), phoenix)
  const playing = player.playAck(connecting, connecting.playToken)
  const stopped = player.stop(playing)
  assert.equal(stopped.status, "idle")
  assert.equal(stopped.station.callSign, "KEC94")
  assert.equal(stopped.error, null)
})

const phoenixAlt = {
  callSign: "KEC94",
  streamUrl: "https://wxradio.org/AZ-Phoenix-KEC94-alt1"
}

test("isActiveStream matches the exact stream URL, not just the call sign", () => {
  const playing = player.playAck(player.play(player.initialState(), phoenix), 1)
  assert.equal(player.isActiveStream(playing, phoenix.streamUrl), true)
  assert.equal(player.isActiveStream(playing, phoenixAlt.streamUrl), false)
  assert.equal(player.isActiveStream(player.play(player.initialState(), phoenix), phoenix.streamUrl), true)
  assert.equal(player.isActiveStream(player.stop(playing), phoenix.streamUrl), false)
  assert.equal(player.isActiveStream(playing, ""), false)
})

test("withStation returns a new state and leaves the original untouched", () => {
  const idle = player.initialState()
  const next = player.withStation(idle, phoenix)
  assert.notEqual(next, idle)
  assert.equal(next.station.callSign, "KEC94")
  assert.equal(idle.station, null)
  assert.equal(next.status, "idle")
})

test("clampVolume rounds and clamps to 0..100", () => {
  assert.equal(player.clampVolume(42.6), 43)
  assert.equal(player.clampVolume(-5), 0)
  assert.equal(player.clampVolume(250), 100)
  assert.equal(player.clampVolume("nope"), null)
  assert.equal(player.clampVolume("50"), 50)
  assert.equal(player.clampVolume(50), 50)
  assert.equal(player.clampVolume(""), null)
  assert.equal(player.clampVolume("  "), null)
})

test("settings round-trip station and consent, and still read an old volume", () => {
  const raw = player.serializeSettings(phoenix, true)
  assert.deepEqual(player.parseSettings(raw), {
    station: {
      callSign: "KEC94",
      streamUrl: "http://wxradio.org:8000/AZ-Phoenix-KEC94"
    },
    volume: null,
    networkLocate: true
  })
  assert.equal(player.parseSettings(JSON.stringify({ volume: "50", networkLocate: false })).volume, 50)
})

test("a dead relay is Offline, and a missing player is not", () => {
  const relay = player.playbackFailure(2, "Failed to open http://wxradio.org:8000/x.", false, true)
  assert.equal(relay.kind, "relay")
  assert.equal(relay.label, "Offline")
  assert.match(player.playbackSentence(relay.kind, "KXI58"), /relay did not start/)

  const missing = player.playbackFailure(127, "icestream: mpv not found in PATH", false, true)
  assert.equal(missing.kind, "needs-mpv")
  assert.equal(missing.label, "Needs mpv")
  assert.doesNotMatch(player.playbackSentence(missing.kind, "KXI58"), /relay did not start/)

  const prefixed = player.playbackFailure(2, "icestream: refusing url", false, true)
  assert.equal(prefixed.kind, "could-not-start")
  assert.equal(prefixed.label, "Cannot play")

  const codeOnly = player.playbackFailure(64, "", false, true)
  assert.equal(codeOnly.kind, "could-not-start")

  const never = player.playbackFailure(null, "", false, false)
  assert.equal(never.kind, "did-not-start")
  assert.equal(never.label, "Cannot play")
  assert.equal(player.playbackSentence(never.kind, "KXI58"), "IceStream's player did not start.")

  const stopped = player.playbackFailure(2, "", true, true)
  assert.equal(stopped.kind, "stopped")
  assert.equal(player.playbackSentence(stopped.kind, "KXI58"), "KXI58 stream stopped.")
})

test("dependency notice names only the programs that are missing", () => {
  assert.equal(player.dependencyNotice("mpv ok\npython ok\ncurl ok\n", true), "")
  assert.equal(player.dependencyNotice("", false), "IceStream's player did not start.")
  assert.match(player.dependencyNotice("icestream: mpv not found\npython ok\ncurl ok\n", true), /needs mpv/)
  assert.match(player.dependencyNotice("mpv ok\nicestream: python not found\nicestream: curl not found\n", true), /needs Python/)
  assert.match(player.dependencyNotice("mpv ok\nicestream: python not found\nicestream: curl not found\n", true), /needs curl/)
})

test("parseSettings tolerates old files and junk", () => {
  assert.deepEqual(player.parseSettings(JSON.stringify({ station: phoenix })), {
    station: {
      callSign: "KEC94",
      streamUrl: "http://wxradio.org:8000/AZ-Phoenix-KEC94"
    },
    volume: null,
    networkLocate: false
  })
  assert.deepEqual(player.parseSettings("{"), { station: null, volume: null, networkLocate: false })
  assert.deepEqual(player.parseSettings(""), { station: null, volume: null, networkLocate: false })
  assert.deepEqual(player.parseSettings(JSON.stringify({ volume: 900 })), { station: null, volume: 100, networkLocate: false })
})

test("parseSettings drops a station whose play address is not the wxradio relay", () => {
  const foreign = player.parseSettings(JSON.stringify({
    station: { callSign: "KEC94", streamUrl: "http://127.0.0.1/x" },
    volume: 10
  }))
  assert.equal(foreign.station, null)
  assert.equal(foreign.volume, 10)
  const badCall = player.parseSettings(JSON.stringify({
    station: { callSign: "../KEC94", streamUrl: "http://wxradio.org:8000/AZ-Phoenix-KEC94" }
  }))
  assert.equal(badCall.station, null)
})
