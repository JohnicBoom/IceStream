import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const broadcastify = require("../lib/broadcastify.js")
const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const catalog = broadcastify.parseCatalog(
  readFileSync(join(root, "data/broadcastify-nwr.json"), "utf8")
)

test("listenUrl builds a Broadcastify listen page and never an audio host", () => {
  assert.equal(broadcastify.listenUrl(46216), "https://www.broadcastify.com/listen/feed/46216")
  assert.equal(broadcastify.listenUrl("46216"), "https://www.broadcastify.com/listen/feed/46216")
  assert.equal(broadcastify.listenUrl(0), null)
  assert.equal(broadcastify.listenUrl("nope"), null)
  assert.equal(broadcastify.listenUrl(-3), null)
})

test("listenUrl never points at audio.broadcastify.com", () => {
  const url = broadcastify.listenUrl(46216)
  assert.ok(url.indexOf("audio.broadcastify.com") === -1)
  assert.ok(url.indexOf(".mp3") === -1)
})

test("parseCatalog reads call signs, feed ids, SAME codes, and online flags", () => {
  const kzz = catalog.find((f) => f.callSign === "KZZ81")
  assert.ok(kzz)
  assert.equal(kzz.feedId, 46216)
  assert.equal(kzz.title, "Lockport")
  assert.equal(kzz.online, true)
  assert.ok(kzz.sameCodes.indexOf("017043") !== -1)
  const kwo = catalog.find((f) => f.callSign === "KWO39")
  assert.equal(kwo.online, false)
})

test("feedForCallSign is case-insensitive", () => {
  assert.equal(broadcastify.feedForCallSign(catalog, "kzz81").feedId, 46216)
  assert.equal(broadcastify.feedForCallSign(catalog, "missing"), null)
})

test("overlappingFeeds lists live neighbors before an offline covering station", () => {
  const feeds = broadcastify.overlappingFeeds(catalog, "KWO39", ["017043"])
  assert.ok(feeds.length >= 2)
  assert.equal(feeds[0].online, true)
  assert.ok(["KZZ81", "KXI58"].indexOf(feeds[0].callSign) !== -1)
  const kwo = feeds.find((f) => f.callSign === "KWO39")
  assert.ok(kwo)
  assert.equal(kwo.online, false)
  assert.ok(feeds.indexOf(kwo) > 0)
})

test("statusLabel names live and offline feeds", () => {
  assert.equal(broadcastify.statusLabel({ online: true }), "live")
  assert.equal(broadcastify.statusLabel({ online: false }), "offline")
  assert.equal(broadcastify.statusLabel({}), "unknown")
})

test("overlappingFeeds still returns SAME neighbors when the covering station has no page", () => {
  const feeds = broadcastify.overlappingFeeds(catalog, "ZZZZZ", ["017043"])
  assert.ok(feeds.some((f) => f.callSign === "KZZ81"))
  assert.ok(!feeds.some((f) => f.callSign === "ZZZZZ"))
})
