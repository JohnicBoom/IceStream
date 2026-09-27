import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { test } from "node:test"

const require = createRequire(import.meta.url)
const transport = require("../lib/transport.js")

// Feed events in order; return the final state and each step's effect types.
function run(events, state = transport.initial()) {
  const log = []
  for (const event of events) {
    const r = transport.step(state, event)
    state = r.state
    log.push(r.effects.map((e) => (e.type === "launch" ? "launch:" + e.token : e.type === "ended" ? "ended:" + e.token : e.type)))
  }
  return { state, log }
}

const play = (token) => ({ type: "play", token, command: ["play.sh", "sock", "url" + token, "75"] })

test("startup kills orphans once", () => {
  const { log, state } = run([{ type: "start" }, { type: "stopExited" }])
  assert.deepEqual(log, [["runStop"], []])
  assert.equal(state.stopRunning, false)
})

test("play from idle runs the stop script first, then launches", () => {
  const { log, state } = run([play(1), { type: "stopExited" }])
  assert.deepEqual(log, [["closeIpc", "runStop"], ["launch:1"]])
  assert.equal(state.mpvToken, 1)
  assert.equal(state.mpvRunning, true)
})

test("the launch effect carries the command", () => {
  const r1 = transport.step(transport.initial(), play(1))
  const r2 = transport.step(r1.state, { type: "stopExited" })
  assert.deepEqual(r2.effects[0].command, ["play.sh", "sock", "url1", "75"])
})

test("switching streams waits for both the stop script and the old mpv (stop exits first)", () => {
  const { log } = run([play(1), { type: "stopExited" }, play(2), { type: "stopExited" }, { type: "mpvExited" }])
  assert.deepEqual(log, [
    ["closeIpc", "runStop"],
    ["launch:1"],
    ["closeIpc", "terminateMpv", "runStop"],
    [],
    ["closeIpc", "launch:2"]
  ])
})

test("switching streams waits for both (old mpv exits first)", () => {
  const { log } = run([play(1), { type: "stopExited" }, play(2), { type: "mpvExited" }, { type: "stopExited" }])
  assert.deepEqual(log.slice(2), [["closeIpc", "terminateMpv", "runStop"], ["closeIpc"], ["launch:2"]])
})

test("a replaced stream does not report ended", () => {
  const { log } = run([play(1), { type: "stopExited" }, play(2), { type: "mpvExited" }])
  assert.ok(!log.flat().some((e) => e.indexOf("ended") === 0))
})

test("play while the stop script is already running does not start a second one", () => {
  const { log } = run([{ type: "start" }, play(1), { type: "stopExited" }])
  assert.deepEqual(log, [["runStop"], ["closeIpc"], ["launch:1"]])
})

test("rapid plays launch only the latest token", () => {
  const { log, state } = run([play(1), play(2), play(3), { type: "stopExited" }])
  assert.deepEqual(log[3], ["launch:3"])
  assert.equal(state.mpvToken, 3)
})

test("stop cancels a pending launch", () => {
  const { log, state } = run([play(1), { type: "stop" }, { type: "stopExited" }])
  assert.deepEqual(log, [["closeIpc", "runStop"], ["closeIpc"], []])
  assert.equal(state.mpvRunning, false)
  assert.equal(state.pending, null)
})

test("stop while playing terminates mpv and kills strays", () => {
  const { log, state } = run([play(1), { type: "stopExited" }, { type: "stop" }, { type: "mpvExited" }, { type: "stopExited" }])
  assert.deepEqual(log.slice(2), [["closeIpc", "terminateMpv", "runStop"], ["closeIpc", "ended:1"], []])
  assert.equal(state.mpvToken, 0)
})

test("mpv exiting on its own reports ended with its token", () => {
  const { log, state } = run([play(4), { type: "stopExited" }, { type: "mpvExited" }])
  assert.deepEqual(log[2], ["closeIpc", "ended:4"])
  assert.equal(state.mpvRunning, false)
  assert.equal(state.mpvToken, 0)
})

test("a launch that fails to start behaves like an exit", () => {
  const { log } = run([play(1), { type: "stopExited" }, { type: "mpvExited" }, play(2), { type: "stopExited" }])
  assert.deepEqual(log.slice(2), [["closeIpc", "ended:1"], ["closeIpc", "runStop"], ["launch:2"]])
})

test("step never mutates its input", () => {
  const s0 = transport.initial()
  const frozen = JSON.stringify(s0)
  transport.step(s0, play(1))
  assert.equal(JSON.stringify(s0), frozen)
})

test("unknown events are ignored", () => {
  const r = transport.step(transport.initial(), { type: "nope" })
  assert.deepEqual(r.effects, [])
})
