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

test("parseWeatherLocation reads Omarchy weather.json coordinates", () => {
  assert.deepEqual(
    locate.parseWeatherLocation('{"name":"Atlanta","latitude":33.75,"longitude":-84.39}'),
    { name: "Atlanta", latitude: 33.75, longitude: -84.39 }
  )
})

test("parsePlaceQuery distinguishes a US ZIP from a city query", () => {
  assert.deepEqual(locate.parsePlaceQuery("60191"), { kind: "zip", zip: "60191", name: "", state: null })
  assert.deepEqual(locate.parsePlaceQuery(" 60191-1234 "), { kind: "zip", zip: "60191", name: "", state: null })
  assert.deepEqual(locate.parsePlaceQuery("Wood Dale, IL"), {
    kind: "city",
    zip: null,
    name: "Wood Dale",
    state: "IL"
  })
  assert.deepEqual(locate.parsePlaceQuery("Wood Dale"), {
    kind: "city",
    zip: null,
    name: "Wood Dale",
    state: null
  })
  assert.equal(locate.parsePlaceQuery("   "), null)
})

test("parseGeocodingResults prefers a US populated place matching the state hint", () => {
  const place = locate.parseGeocodingResults(readFixture("geocode-wood-dale.json"), "IL")
  assert.equal(place.name, "Wood Dale")
  assert.equal(place.state, "Illinois")
  assert.equal(place.latitude, 41.96336)
  assert.equal(place.longitude, -87.97896)
})

test("parseGeocodingResults returns null when there are no usable hits", () => {
  assert.equal(locate.parseGeocodingResults(""), null)
  assert.equal(locate.parseGeocodingResults("{}"), null)
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
