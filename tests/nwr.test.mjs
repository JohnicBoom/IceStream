import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const nwr = require("../lib/nwr.js")
const here = dirname(fileURLToPath(import.meta.url))
const excerpt = readFileSync(join(here, "fixtures/ccl-data-excerpt.js"), "utf8")

test("parseCclData reads transmitters, SAME codes, and tower coordinates without evaluating the script", () => {
  const list = nwr.parseCclData(excerpt)
  assert.deepEqual(list.map((t) => t.callSign), ["KWO39", "KZZ81", "WXBAD"])
  assert.deepEqual(list[0], {
    callSign: "KWO39",
    frequency: "162.550",
    siteName: "Chicago",
    siteCity: "Wood Dale",
    siteState: "IL",
    status: "NORMAL",
    latitude: 41.8789,
    longitude: -87.6361,
    sameCodes: ["017031", "017043"]
  })
  assert.equal(list[2].latitude, null)
  assert.equal(list[2].longitude, null)
  assert.deepEqual(list[2].sameCodes, ["017001"])
})

test("parseCclData returns [] for junk or a changed format", () => {
  assert.deepEqual(nwr.parseCclData(""), [])
  assert.deepEqual(nwr.parseCclData("alert(1)"), [])
  assert.deepEqual(nwr.parseCclData("var cclData = {\"not\": \"a list\"};"), [])
  assert.deepEqual(nwr.parseCclData("var cclData = [{\"nope\": 1}];"), [])
})

test("looksComplete rejects a partial or empty download", () => {
  assert.equal(nwr.looksComplete(nwr.parseCclData(excerpt)), false)
  assert.equal(nwr.looksComplete(new Array(1000).fill({ callSign: "X" })), true)
  assert.equal(nwr.looksComplete(new Array(2001).fill({ callSign: "KWO39" })), false)
})

test("serializeBundle and parseBundle round-trip", () => {
  const list = nwr.parseCclData(excerpt)
  const raw = nwr.serializeBundle(list, "2026-09-27")
  assert.ok(raw.indexOf("\n    {\"callSign\":\"KWO39\"") !== -1, "one transmitter per line")
  const bundle = JSON.parse(raw)
  assert.equal(bundle.source, nwr.CCL_SOURCE)
  assert.equal(bundle.generated, "2026-09-27")
  assert.equal(bundle.count, 3)
  assert.deepEqual(nwr.parseBundle(raw), list)
})

test("parseBundle drops malformed rows and tolerates junk", () => {
  const raw = JSON.stringify({
    transmitters: [
      { callSign: "KWO39", sameCodes: ["017043"], latitude: 41.8789, longitude: -87.6361 },
      { callSign: "", sameCodes: [] },
      { callSign: "KXI58", sameCodes: "017043", latitude: "x" },
      null
    ]
  })
  const list = nwr.parseBundle(raw)
  assert.deepEqual(list.map((t) => t.callSign), ["KWO39", "KXI58"])
  assert.deepEqual(list[1].sameCodes, [])
  assert.equal(list[1].latitude, null)
  assert.deepEqual(nwr.parseBundle("{"), [])
})

test("the bundled data file covers every transmitter with SAME codes and tower coordinates", () => {
  const list = nwr.parseBundle(readFileSync(join(here, "../data/nwr-transmitters.json"), "utf8"))
  assert.ok(nwr.looksComplete(list))
  const kwo = list.find((t) => t.callSign === "KWO39")
  assert.equal(kwo.latitude, 41.8789)
  assert.equal(kwo.longitude, -87.6361)
  assert.ok(kwo.sameCodes.indexOf("017043") !== -1)
  assert.ok(list.find((t) => t.callSign === "KZZ81"))
  assert.ok(list.find((t) => t.callSign === "KXI58"))
})
