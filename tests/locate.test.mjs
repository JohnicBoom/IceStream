import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const locate = require("../lib/locate.js")
const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures")

function readFixture(name) {
  return readFileSync(join(fixtures, name), "utf8")
}

test("normalizeZip accepts a 5-digit US ZIP and strips extra characters", () => {
  assert.equal(locate.normalizeZip("30318"), "30318")
  assert.equal(locate.normalizeZip(" 30318-1234 "), "30318")
  assert.equal(locate.normalizeZip("30318 1234"), "30318")
})

test("normalizeZip rejects empty or non-numeric input", () => {
  assert.equal(locate.normalizeZip(""), null)
  assert.equal(locate.normalizeZip("abcde"), null)
  assert.equal(locate.normalizeZip("123"), null)
})

test("parseZipLookup reads coordinates from Zippopotam", () => {
  const place = locate.parseZipLookup(readFixture("zip-30318.json"))
  assert.deepEqual(place, {
    zip: "30318",
    latitude: 33.7865,
    longitude: -84.4454,
    city: "Atlanta",
    state: "GA"
  })
})

test("parseZipLookup returns null for unknown or unparseable ZIP payloads", () => {
  assert.equal(locate.parseZipLookup(""), null)
  assert.equal(locate.parseZipLookup("{}"), null)
  assert.equal(locate.parseZipLookup('{"places":[]}'), null)
})

test("nwsPointUrl rounds to four decimals so NWS does not 301 the request", () => {
  assert.equal(locate.nwsPointUrl(41.96336, -87.97896), "https://api.weather.gov/points/41.9634,-87.9790")
})

test("parseNwsPoints reads the covering NWR transmitter", () => {
  const point = locate.parseNwsPoints(readFixture("nws-points.json"))
  assert.deepEqual(point, {
    transmitter: "KZZ67",
    sameCode: "020201",
    latitude: 39.7456,
    longitude: -97.0892,
    city: "Linn",
    state: "KS"
  })
})

test("parseNwsPoints returns null when nwr is missing or the body is junk", () => {
  assert.equal(locate.parseNwsPoints(""), null)
  assert.equal(locate.parseNwsPoints(JSON.stringify({ properties: {} })), null)
})

test("parseWttrNearestArea reads IP auto-detect coordinates from wttr.in j1", () => {
  const place = locate.parseWttrNearestArea(readFixture("wttr-j1-lombard.json"))
  assert.deepEqual(place, {
    name: "Lombard",
    latitude: 41.88,
    longitude: -88.008
  })
})

test("parseWeatherLocation reads Omarchy weather.json coordinates", () => {
  assert.deepEqual(
    locate.parseWeatherLocation('{"name":"Atlanta","latitude":33.75,"longitude":-84.39}'),
    { name: "Atlanta", latitude: 33.75, longitude: -84.39 }
  )
})

test("parseNwsTransmitter reads a single /radio/{callSign} payload", () => {
  const tx = locate.parseNwsTransmitter(readFixture("nws-transmitter-kwo39.json"))
  assert.deepEqual(tx, {
    callSign: "KWO39",
    frequency: "162.550",
    siteName: "Chicago",
    siteCity: "Wood Dale",
    siteState: "IL",
    sameCodes: ["017043"],
    counties: ["ILC043"]
  })
})

test("rankOnlineOptions prefers a closer working source over a farther Icecast mount", () => {
  const origin = { latitude: 41.96336, longitude: -87.97896 }
  const ranked = locate.rankOnlineOptions(origin, [
    {
      callSign: "KWO39",
      covering: true,
      latitude: 41.96336,
      longitude: -87.97896,
      streamUrl: null,
      broadcastifyOnline: false
    },
    {
      callSign: "KXI58",
      latitude: 41.6062,
      longitude: -88.4526,
      streamUrl: "http://wxradio.org:8000/IL-Plano-KXI58",
      broadcastifyOnline: true
    },
    {
      callSign: "KZZ81",
      latitude: 41.6246,
      longitude: -88.0042,
      streamUrl: null,
      broadcastifyUrl: "https://www.broadcastify.com/listen/feed/46216",
      broadcastifyOnline: true
    }
  ])
  assert.equal(ranked[0].callSign, "KZZ81")
  assert.equal(ranked[1].callSign, "KXI58")
  assert.equal(ranked[2].callSign, "KWO39")
})

test("haversineDistanceKm is shorter for Plano than Champaign from Wood Dale", () => {
  const woodDale = { latitude: 41.9602, longitude: -87.981 }
  const plano = locate.haversineDistanceKm(woodDale.latitude, woodDale.longitude, 41.6628, -88.5373)
  const champaign = locate.haversineDistanceKm(woodDale.latitude, woodDale.longitude, 40.1164, -88.2434)
  assert.ok(plano < champaign)
})

test("parseWeatherLocation treats a missing or nameless file as unset", () => {
  assert.deepEqual(locate.parseWeatherLocation(""), { name: "", latitude: null, longitude: null })
  assert.deepEqual(locate.parseWeatherLocation("{"), { name: "", latitude: null, longitude: null })
  assert.deepEqual(locate.parseWeatherLocation('{"name":"Malibu"}'), {
    name: "Malibu",
    latitude: null,
    longitude: null
  })
})

test("parsePlaceQuery only recognizes a US ZIP", () => {
  assert.deepEqual(locate.parsePlaceQuery("60191"), { kind: "zip", zip: "60191" })
  assert.deepEqual(locate.parsePlaceQuery(" 60191-1234 "), { kind: "zip", zip: "60191" })
  assert.equal(locate.parsePlaceQuery("Wood Dale, IL"), null)
  assert.equal(locate.parsePlaceQuery("   "), null)
})

const woodDale = { latitude: 41.96336, longitude: -87.97896 }
const kwo39 = {
  callSign: "KWO39",
  siteName: "Chicago",
  siteCity: "Wood Dale",
  siteState: "IL",
  frequency: "162.550",
  streamUrl: null,
  sameCodes: ["017043"]
}
const plano = {
  callSign: "KXI58",
  state: "IL",
  siteName: "Plano",
  streamUrl: "http://wxradio.org:8000/IL-Plano-KXI58"
}
const bcfyCatalog = require("../lib/broadcastify.js").parseCatalog(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../data/broadcastify-nwr.json"), "utf8")
)

test("buildLocateOptions ranks Wood Dale covering offline then Lockport then Plano", () => {
  const ranked = locate.buildLocateOptions({
    covering: kwo39,
    streams: [plano],
    broadcastify: bcfyCatalog,
    origin: woodDale,
    sameCode: "017043"
  })
  assert.equal(ranked[0].callSign, "KZZ81")
  assert.equal(locate.optionKind(ranked[0]), "browser-only")
  assert.equal(ranked[1].callSign, "KXI58")
  assert.equal(locate.optionKind(ranked[1]), "available")
  const kwo = ranked.find((s) => s.callSign === "KWO39")
  assert.ok(kwo)
  assert.equal(kwo.covering, true)
  assert.equal(locate.optionKind(kwo), "offline")
})

test("buildLocateOptions finds Icecast neighbors through NWS SAME codes without a Broadcastify entry", () => {
  const covering = {
    callSign: "KZZ67",
    siteName: "Linn",
    siteState: "KS",
    frequency: "162.500",
    streamUrl: null,
    sameCodes: ["020201", "020027"]
  }
  const transmitters = [
    { callSign: "KZZ67", siteName: "Linn", siteState: "KS", frequency: "162.500", sameCodes: ["020201", "020027"] },
    { callSign: "WXK91", siteName: "Topeka", siteCity: "Topeka", siteState: "KS", frequency: "162.475", sameCodes: ["020177", "020201"] },
    { callSign: "WXK95", siteName: "Salina", siteState: "KS", frequency: "162.400", sameCodes: ["020169", "020027"] },
    { callSign: "KEC94", siteName: "Phoenix", siteState: "AZ", frequency: "162.550", sameCodes: ["004013"] }
  ]
  const streams = [
    { callSign: "WXK91", state: "KS", siteName: "Topeka", streamUrl: "http://wxradio.org:8000/KS-Topeka-WXK91" },
    { callSign: "WXK95", state: "KS", siteName: "Salina", streamUrl: "http://wxradio.org:8000/KS-Salina-WXK95" },
    { callSign: "KEC94", state: "AZ", siteName: "Phoenix", streamUrl: "http://wxradio.org:8000/AZ-Phoenix-KEC94" }
  ]
  const ranked = locate.buildLocateOptions({
    covering,
    streams,
    broadcastify: [],
    transmitters,
    origin: { latitude: 39.7456, longitude: -97.0892 },
    sameCode: "020201"
  })
  const calls = ranked.map((s) => s.callSign)
  assert.deepEqual(calls, ["WXK91", "KZZ67"])
  assert.equal(ranked[0].frequency, "162.475")
  assert.equal(ranked[0].siteState, "KS")
  assert.equal(locate.optionKind(ranked[0]), "available")
})

test("buildLocateOptions falls back to the covering SAME list when the point has no county code", () => {
  const covering = { callSign: "KZZ67", siteState: "KS", streamUrl: null, sameCodes: ["020027"] }
  const transmitters = [
    { callSign: "WXK95", siteName: "Salina", siteState: "KS", sameCodes: ["020027"] }
  ]
  const streams = [
    { callSign: "WXK95", state: "KS", siteName: "Salina", streamUrl: "http://wxradio.org:8000/KS-Salina-WXK95" }
  ]
  const ranked = locate.buildLocateOptions({ covering, streams, transmitters, origin: null, sameCode: "" })
  assert.deepEqual(ranked.map((s) => s.callSign), ["WXK95", "KZZ67"])
})

test("buildLocateOptions carries a covering Broadcastify page so its kind is browser-only", () => {
  const covering = { callSign: "KZZ81", siteName: "Lockport", siteState: "IL", streamUrl: null, sameCodes: [] }
  const ranked = locate.buildLocateOptions({ covering, broadcastify: bcfyCatalog, origin: woodDale, sameCode: "" })
  const kzz = ranked.find((s) => s.covering)
  assert.equal(kzz.callSign, "KZZ81")
  assert.equal(locate.optionKind(kzz), "browser-only")
})

test("buildLocateOptions ranks by NOAA tower coordinates carried on transmitters", () => {
  const covering = { callSign: "KZZ67", siteState: "KS", streamUrl: null, sameCodes: ["020201"] }
  const transmitters = [
    { callSign: "KZZ67", siteState: "KS", sameCodes: ["020201"], latitude: 39.7067, longitude: -96.557 },
    { callSign: "WXK91", siteName: "Topeka", siteState: "KS", sameCodes: ["020201"], latitude: 39.006, longitude: -96.0494 },
    { callSign: "WXK95", siteName: "Salina", siteState: "KS", sameCodes: ["020201"], latitude: 38.84, longitude: -97.61 },
    { callSign: "KZZ68", siteName: "Near", siteState: "KS", sameCodes: ["020201"], latitude: 39.75, longitude: -97.1 }
  ]
  const streams = [
    { callSign: "WXK91", state: "KS", siteName: "Topeka", streamUrl: "http://wxradio.org:8000/KS-Topeka-WXK91" },
    { callSign: "WXK95", state: "KS", siteName: "Salina", streamUrl: "http://wxradio.org:8000/KS-Salina-WXK95" },
    { callSign: "KZZ68", state: "KS", siteName: "Near", streamUrl: "http://wxradio.org:8000/KS-Near-KZZ68" }
  ]
  const ranked = locate.buildLocateOptions({
    covering,
    streams,
    transmitters,
    origin: { latitude: 39.7456, longitude: -97.0892 },
    sameCode: "020201"
  })
  assert.deepEqual(ranked.map((s) => s.callSign), ["KZZ68", "WXK95", "WXK91", "KZZ67"])
  assert.equal(ranked[3].latitude, 39.7067)
})

test("NOAA tower coordinates win over Broadcastify coordinates", () => {
  const covering = { callSign: "KWO39", siteState: "IL", streamUrl: null, sameCodes: [] }
  const ranked = locate.buildLocateOptions({
    covering,
    transmitters: [{ callSign: "KWO39", sameCodes: [], latitude: 41.8789, longitude: -87.6361 }],
    broadcastify: [{ callSign: "KWO39", title: "Chicago", url: "u", online: false, latitude: 41.9634, longitude: -87.979, sameCodes: [] }],
    origin: woodDale
  })
  assert.equal(ranked[0].latitude, 41.8789)
  assert.equal(ranked[0].longitude, -87.6361)
})

test("Wood Dale ranking holds with the bundled NOAA transmitter data", () => {
  const transmitters = require("../lib/nwr.js").parseBundle(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../data/nwr-transmitters.json"), "utf8")
  )
  const ranked = locate.buildLocateOptions({
    covering: kwo39,
    streams: [plano],
    broadcastify: bcfyCatalog,
    transmitters,
    origin: woodDale,
    sameCode: "017043"
  })
  assert.deepEqual(ranked.slice(0, 2).map((s) => s.callSign), ["KZZ81", "KXI58"])
  const kwo = ranked.find((s) => s.covering)
  assert.equal(kwo.callSign, "KWO39")
  assert.equal(locate.optionKind(kwo), "offline")
})

test("optionAction plays Available, opens live Broadcastify pages, and does nothing for Offline", () => {
  assert.equal(locate.optionAction({ streamUrl: "http://x" }), "play")
  assert.equal(locate.optionAction({ broadcastifyUrl: "u", broadcastifyOnline: true }), "browser")
  assert.equal(locate.optionAction({ broadcastifyUrl: "u", broadcastifyOnline: null }), "browser")
  assert.equal(locate.optionAction({ broadcastifyUrl: "u", broadcastifyOnline: false }), "none")
  assert.equal(locate.optionAction({}), "none")
  assert.equal(locate.optionAction(null), "none")
})
