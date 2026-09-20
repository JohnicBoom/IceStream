import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const catalog = require("../lib/catalog.js")
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures")

function readFixture(name) {
  return readFileSync(join(fixtures, name), "utf8")
}

test("parseMount extracts state, site, and call sign from a primary mount", () => {
  const parsed = catalog.parseMount("http://wxradio.org:8000/AZ-Phoenix-KEC94")
  assert.deepEqual(parsed, {
    mount: "AZ-Phoenix-KEC94",
    state: "AZ",
    siteName: "Phoenix",
    callSign: "KEC94",
    alt: false,
    altIndex: null
  })
})

test("parseMount strips -alt and -altN suffixes", () => {
  assert.equal(catalog.parseMount("FL-Tallahassee-KIH24-alt").callSign, "KIH24")
  assert.equal(catalog.parseMount("FL-Tallahassee-KIH24-alt").alt, true)
  assert.equal(catalog.parseMount("FL-Tallahassee-KIH24-alt").altIndex, 0)
  assert.equal(catalog.parseMount("KS-Topeka-WXK91-alt1").callSign, "WXK91")
  assert.equal(catalog.parseMount("KS-Topeka-WXK91-alt1").altIndex, 1)
})

test("parseMount keeps a slash inside the site name", () => {
  const parsed = catalog.parseMount("http://wxradio.org:8000/MA-Bourne/Hyannis-KEC73")
  assert.equal(parsed.callSign, "KEC73")
  assert.equal(parsed.state, "MA")
  assert.equal(parsed.siteName, "Bourne/Hyannis")
  assert.equal(parsed.mount, "MA-Bourne/Hyannis-KEC73")
})

test("playableStreamUrl keeps the Icecast listenurl so mpv can connect", () => {
  assert.equal(
    catalog.playableStreamUrl("http://wxradio.org:8000/AZ-Phoenix-KEC94"),
    "http://wxradio.org:8000/AZ-Phoenix-KEC94"
  )
  assert.equal(
    catalog.playableStreamUrl("AZ-Phoenix-KEC94"),
    "https://wxradio.org/AZ-Phoenix-KEC94"
  )
})

test("httpsStreamUrl rewrites Icecast listenurl to the public https form", () => {
  assert.equal(
    catalog.httpsStreamUrl("http://wxradio.org:8000/AZ-Phoenix-KEC94"),
    "https://wxradio.org/AZ-Phoenix-KEC94"
  )
  assert.equal(
    catalog.httpsStreamUrl("http://wxradio.org:8000/MA-Bourne/Hyannis-KEC73"),
    "https://wxradio.org/MA-Bourne/Hyannis-KEC73"
  )
  assert.equal(
    catalog.httpsStreamUrl("https://wxradio.org/AZ-Phoenix-KEC94"),
    "https://wxradio.org/AZ-Phoenix-KEC94"
  )
})

test("parseIcecastStatus reads an array of sources", () => {
  const streams = catalog.parseIcecastStatus(readFixture("icecast-status.json"))
  assert.equal(streams.length, 6)
  const phoenix = streams.find((s) => s.callSign === "KEC94")
  assert.ok(phoenix)
  assert.equal(phoenix.streamUrl, "http://wxradio.org:8000/AZ-Phoenix-KEC94")
  assert.equal(phoenix.state, "AZ")
  assert.equal(phoenix.alt, false)
  assert.equal(phoenix.listeners, 4)
})

test("parseIcecastStatus wraps a single source object", () => {
  const streams = catalog.parseIcecastStatus(readFixture("icecast-single-source.json"))
  assert.equal(streams.length, 1)
  assert.equal(streams[0].callSign, "WXJ84")
  assert.equal(streams[0].streamUrl, "http://wxradio.org:8000/WV-Charleston-WXJ84")
})

test("parseIcecastStatus returns [] for empty or unparseable input", () => {
  assert.deepEqual(catalog.parseIcecastStatus(""), [])
  assert.deepEqual(catalog.parseIcecastStatus("{"), [])
  assert.deepEqual(catalog.parseIcecastStatus(JSON.stringify({ icestats: {} })), [])
})

test("parseNwsRadioList reads transmitters and the next page cursor", () => {
  const page = catalog.parseNwsRadioList(readFixture("nws-radio-page.json"))
  assert.equal(page.transmitters.length, 3)
  assert.equal(page.next, "https://api.weather.gov/radio?cursor=eyJpIjo1MDB9")
  const phoenix = page.transmitters.find((t) => t.callSign === "KEC94")
  assert.deepEqual(phoenix, {
    callSign: "KEC94",
    frequency: "162.550",
    siteName: "Phoenix",
    siteCity: "South Mtn.",
    siteState: "AZ",
    sameCodes: ["004013", "004021"],
    counties: ["AZC013", "AZC021"]
  })
})

test("parseNwsRadioList returns empty transmitters for bad input", () => {
  assert.deepEqual(catalog.parseNwsRadioList(""), { transmitters: [], next: null })
  assert.deepEqual(catalog.parseNwsRadioList("{}"), { transmitters: [], next: null })
})
