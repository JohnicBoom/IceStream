import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { test } from "node:test"

const require = createRequire(import.meta.url)
const mpv = require("../lib/mpv.js")

test("command builds one newline-terminated JSON IPC line", () => {
  assert.equal(mpv.command(["set_property", "volume", 40]), '{"command":["set_property","volume",40]}\n')
})

test("setVolumeCommand clamps and sends an integer volume", () => {
  assert.equal(mpv.setVolumeCommand(140), '{"command":["set_property","volume",130]}\n')
  assert.equal(mpv.setVolumeCommand(130), '{"command":["set_property","volume",130]}\n')
  assert.equal(mpv.setVolumeCommand(33.4), '{"command":["set_property","volume",33]}\n')
})

test("observePlaybackCommand watches core-idle", () => {
  assert.equal(mpv.observePlaybackCommand(), '{"command":["observe_property",1,"core-idle"]}\n')
})

test("parseLine returns an object or null", () => {
  assert.deepEqual(mpv.parseLine('{"event":"file-loaded"}'), { event: "file-loaded" })
  assert.equal(mpv.parseLine(""), null)
  assert.equal(mpv.parseLine("not json"), null)
  assert.equal(mpv.parseLine("42"), null)
})

test("isPlaybackStarted is true only when core-idle turns false", () => {
  assert.equal(mpv.isPlaybackStarted({ event: "property-change", id: 1, name: "core-idle", data: false }), true)
  assert.equal(mpv.isPlaybackStarted({ event: "property-change", id: 1, name: "core-idle", data: true }), false)
  assert.equal(mpv.isPlaybackStarted({ event: "playback-restart" }), false)
  assert.equal(mpv.isPlaybackStarted({ request_id: 0, error: "success" }), false)
  assert.equal(mpv.isPlaybackStarted(null), false)
})
