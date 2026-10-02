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
    "http://wxradio.org:8000/AZ-Phoenix-KEC94"
  )
  assert.equal(
    catalog.playableStreamUrl("https://wxradio.org/MA-Bourne/Hyannis-KEC73"),
    "http://wxradio.org:8000/MA-Bourne/Hyannis-KEC73"
  )
})

test("playableStreamUrl refuses any host that is not the wxradio relay", () => {
  assert.equal(catalog.playableStreamUrl("http://127.0.0.1/x"), "")
  assert.equal(catalog.playableStreamUrl("http://10.1.2.3/x"), "")
  assert.equal(catalog.playableStreamUrl("http://169.254.169.254/latest"), "")
  assert.equal(catalog.playableStreamUrl("http://evil.example/AZ-Phoenix-KEC94"), "")
  assert.equal(catalog.playableStreamUrl("http://wxradio.org:8000/../etc/passwd"), "")
  assert.equal(catalog.playableStreamUrl("http://user@wxradio.org:8000/AZ-Phoenix-KEC94"), "")
  assert.equal(catalog.playableStreamUrl("http://wxradio.org:8000/AZ-Phoenix-KEC94?x=1"), "")
  assert.equal(catalog.playableStreamUrl("file:///etc/passwd"), "")
  assert.equal(catalog.playableStreamUrl("http://wxradio.org:8000/" + "A".repeat(81)), "")
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

test("parseIcecastStatus drops foreign listen URLs and refuses an oversized catalog", () => {
  const mixed = catalog.parseIcecastStatus(JSON.stringify({
    icestats: {
      source: [
        { listenurl: "http://127.0.0.1/secret", listeners: 1 },
        { listenurl: "http://wxradio.org:8000/AZ-Phoenix-KEC94", listeners: 2, server_type: "audio/mpeg" }
      ]
    }
  }))
  assert.equal(mixed.length, 1)
  assert.equal(mixed[0].streamUrl, "http://wxradio.org:8000/AZ-Phoenix-KEC94")
  const sources = []
  for (let i = 0; i < 501; i++) sources.push({ listenurl: "http://wxradio.org:8000/AZ-Phoenix-KEC94" })
  assert.deepEqual(catalog.parseIcecastStatus(JSON.stringify({ icestats: { source: sources } })), [])
})

test("parseIcecastStatus returns [] for empty or unparseable input", () => {
  assert.deepEqual(catalog.parseIcecastStatus(""), [])
  assert.deepEqual(catalog.parseIcecastStatus("{"), [])
  assert.deepEqual(catalog.parseIcecastStatus(JSON.stringify({ icestats: {} })), [])
})

test("statusUrl fetches the Icecast catalog over HTTPS", () => {
  assert.equal(catalog.statusUrl, "https://wxradio.org/status-json.xsl")
})

test("HTTPS catalog still yields port-8000 listen URLs for mpv", () => {
  const streams = catalog.parseIcecastStatus(readFixture("icecast-status.json"))
  assert.ok(streams.every((s) => s.streamUrl.indexOf("http://wxradio.org:8000/") === 0))
})

test("mergeByCallSign keeps fresh entries and previously remembered extras", () => {
  const fresh = [{ callSign: "KEC94", siteName: "Phoenix (new)" }]
  const previous = [{ callSign: "KEC94", siteName: "Phoenix (old)" }, { callSign: "KWO39", siteName: "Chicago" }]
  assert.deepEqual(catalog.mergeByCallSign(fresh, previous), [
    { callSign: "KEC94", siteName: "Phoenix (new)" },
    { callSign: "KWO39", siteName: "Chicago" }
  ])
  assert.deepEqual(catalog.mergeByCallSign([], previous), previous)
})

test("replaceTransmitters drops transmitters NOAA removed but keeps individual NWS lookups", () => {
  const current = [
    { callSign: "KEC94", siteName: "Phoenix (old)" },
    { callSign: "GONE1", siteName: "Decommissioned" },
    { callSign: "LOOK1", siteName: "Looked up", lookedUp: true },
    { callSign: "KEC95", siteName: "Looked up but now in NOAA", lookedUp: true }
  ]
  const fresh = [{ callSign: "KEC94", siteName: "Phoenix" }, { callSign: "KEC95", siteName: "NOAA" }]
  assert.deepEqual(catalog.replaceTransmitters(fresh, current).map((t) => t.callSign + ":" + t.siteName), [
    "KEC94:Phoenix",
    "KEC95:NOAA",
    "LOOK1:Looked up"
  ])
})

test("userAgent identifies the plugin", () => {
  assert.ok(catalog.userAgent.indexOf("IceStream") === 0)
})
