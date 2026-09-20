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

test("pause and resume toggle playing without changing the station", () => {
  const connecting = player.play(player.initialState(), phoenix)
  const playing = player.playAck(connecting, connecting.playToken)
  const paused = player.pause(playing)
  assert.equal(paused.status, "paused")
  assert.equal(paused.station.callSign, "KEC94")
  const resumed = player.resume(paused)
  assert.equal(resumed.status, "playing")
})

test("pause is a no-op unless playing", () => {
  const idle = player.pause(player.initialState())
  assert.equal(idle.status, "idle")
  const connecting = player.play(player.initialState(), phoenix)
  assert.equal(player.pause(connecting).status, "connecting")
})

test("stop returns to idle but keeps the last station", () => {
  const connecting = player.play(player.initialState(), phoenix)
  const playing = player.playAck(connecting, connecting.playToken)
  const stopped = player.stop(playing)
  assert.equal(stopped.status, "idle")
  assert.equal(stopped.station.callSign, "KEC94")
  assert.equal(stopped.error, null)
})

test("togglePlay starts, pauses, and resumes from the bar", () => {
  const started = player.togglePlay(player.initialState(), phoenix)
  assert.equal(started.status, "connecting")
  const playing = player.playAck(started, started.playToken)
  const paused = player.togglePlay(playing, phoenix)
  assert.equal(paused.status, "paused")
  const resumed = player.togglePlay(paused, phoenix)
  assert.equal(resumed.status, "playing")
})
