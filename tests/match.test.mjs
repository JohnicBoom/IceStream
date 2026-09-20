import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const catalog = require("../lib/catalog.js")
const match = require("../lib/match.js")
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures")

const streams = catalog.parseIcecastStatus(
  readFileSync(join(fixtures, "icecast-status.json"), "utf8")
)
const transmitters = catalog.parseNwsRadioList(
  readFileSync(join(fixtures, "nws-radio-page.json"), "utf8")
).transmitters

test("preferStream picks a primary mount over an alt of the same call sign", () => {
  const kih = streams.filter((s) => s.callSign === "KIH24")
  const preferred = match.preferStream(kih)
  assert.equal(preferred.mount, "FL-Tallahassee-KIH24")
  assert.equal(preferred.alt, false)
})

test("preferStream uses the only available alt when there is no primary", () => {
  const wxk = streams.filter((s) => s.callSign === "WXK91")
  const preferred = match.preferStream(wxk)
  assert.equal(preferred.mount, "KS-Topeka-WXK91-alt1")
  assert.equal(preferred.alt, true)
})

test("resolveCovering selects a live stream for the covering transmitter", () => {
  const result = match.resolveCovering("KEC94", transmitters, streams)
  assert.equal(result.covering.callSign, "KEC94")
  assert.equal(result.covering.siteName, "Phoenix")
  assert.equal(result.streamUrl, "http://wxradio.org:8000/AZ-Phoenix-KEC94")
  assert.equal(result.fallback, null)
})

test("resolveCovering keeps a covering station with no stream and offers same-state fallbacks", () => {
  const result = match.resolveCovering("KZZ67", transmitters, streams)
  assert.equal(result.covering.callSign, "KZZ67")
  assert.equal(result.streamUrl, null)
  assert.ok(result.fallback)
  assert.equal(result.fallback.callSign, "WXK91")
  assert.equal(result.fallback.streamUrl, "http://wxradio.org:8000/KS-Topeka-WXK91-alt1")
})

test("resolveCovering keeps a covering transmitter that has no Icecast stream", () => {
  const kwo = {
    callSign: "KWO39",
    frequency: "162.550",
    siteName: "Chicago",
    siteCity: "Wood Dale",
    siteState: "IL"
  }
  const illinois = [
    {
      callSign: "KXI58",
      state: "IL",
      siteName: "Plano",
      streamUrl: "https://wxradio.org/IL-Plano-KXI58",
      mount: "IL-Plano-KXI58",
      alt: false,
      listeners: 1
    }
  ]
  const result = match.resolveCovering("KWO39", [kwo], illinois)
  assert.equal(result.station.callSign, "KWO39")
  assert.equal(result.station.siteCity, "Wood Dale")
  assert.equal(result.streamUrl, null)
  assert.equal(result.fallback.callSign, "KXI58")
})

test("resolveCovering synthesizes a station from a live stream when NWS metadata is missing", () => {
  const result = match.resolveCovering("KEC94", [], streams)
  assert.equal(result.streamUrl, "http://wxradio.org:8000/AZ-Phoenix-KEC94")
  assert.equal(result.station.siteName, "Phoenix")
  assert.equal(result.station.siteState, "AZ")
})

test("resolveCovering returns no covering transmitter for an unknown call sign", () => {
  const result = match.resolveCovering("ZZZZZ", transmitters, streams)
  assert.equal(result.covering, null)
  assert.equal(result.streamUrl, null)
  assert.equal(result.fallback, null)
})

test("preferNearby puts the preferred call sign and same-state streams first", () => {
  const ranked = match.preferNearby(streams, { state: "KS", preferredCallSigns: ["WXK91"] })
  assert.equal(ranked[0].callSign, "WXK91")
  assert.ok(ranked.every((s, i) => {
    if (s.state !== "KS") return true
    const firstOther = ranked.findIndex((x) => x.state !== "KS")
    return firstOther === -1 || i < firstOther
  }))
})

test("filterStreams matches call sign, site, or state", () => {
  const phoenix = match.filterStreams(streams, "kec94")
  assert.equal(phoenix.length, 1)
  assert.equal(phoenix[0].callSign, "KEC94")
  const florida = match.filterStreams(streams, "FL")
  assert.ok(florida.every((s) => s.state === "FL"))
  assert.equal(match.filterStreams(streams, "   ").length, streams.length)
})

test("stationFromCovering merges NWS metadata with the preferred stream", () => {
  const result = match.resolveCovering("WXJ25", transmitters, streams)
  assert.deepEqual(result.station, {
    callSign: "WXJ25",
    frequency: "162.550",
    siteName: "Juneau",
    siteCity: "Juneau",
    siteState: "AK",
    sameCodes: ["002110"],
    streamUrl: "http://wxradio.org:8000/AK-Juneau-WXJ25",
    mount: "AK-Juneau-WXJ25",
    alt: false
  })
})
