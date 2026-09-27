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
})

test("settings round-trip station and volume", () => {
  const raw = player.serializeSettings(phoenix, 40)
  assert.deepEqual(player.parseSettings(raw), { station: phoenix, volume: 40 })
})

test("parseSettings tolerates old files and junk", () => {
  assert.deepEqual(player.parseSettings(JSON.stringify({ station: phoenix })), { station: phoenix, volume: null })
  assert.deepEqual(player.parseSettings("{"), { station: null, volume: null })
  assert.deepEqual(player.parseSettings(""), { station: null, volume: null })
  assert.deepEqual(player.parseSettings(JSON.stringify({ volume: 900 })), { station: null, volume: 100 })
})
