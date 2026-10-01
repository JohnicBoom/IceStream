import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const version = require("../lib/version.js")
const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../manifest.json"), "utf8"))

test("lib/version.js matches manifest.json", () => {
  assert.equal(version.CODE, manifest.version)
})

test("isStale flags an older or pre-handshake Service", () => {
  assert.equal(version.isStale(version.CODE), false)
  assert.equal(version.isStale("0.2.0"), true)
  assert.equal(version.isStale(undefined), true)
  assert.equal(version.isStale(null), true)
})

test("manifestVersion reads the version from manifest.json text", () => {
  assert.equal(version.manifestVersion(JSON.stringify({ version: "0.4.0" })), "0.4.0")
  assert.equal(version.manifestVersion(""), "")
  assert.equal(version.manifestVersion("{"), "")
  assert.equal(version.manifestVersion("{}"), "")
})

test("restartNeeded when the installed files are newer than the running code", () => {
  assert.equal(version.restartNeeded(version.CODE, version.CODE), false)
  assert.equal(version.restartNeeded("9.9.9", version.CODE), true)
  // Not loaded yet: no false alarm.
  assert.equal(version.restartNeeded("", version.CODE), false)
})

test("updateNotice is the popover restart chip", () => {
  assert.equal(version.updateNotice("9.9.9"), "UPDATED TO 9.9.9 · RESTART THE SHELL")
  assert.equal(version.updateNotice(version.CODE), "UPDATED · RESTART THE SHELL")
  assert.equal(version.updateNotice(""), "UPDATED · RESTART THE SHELL")
})

test("restartNeeded when the kept Service is older than the bar code", () => {
  assert.equal(version.restartNeeded(version.CODE, "0.2.0"), true)
  assert.equal(version.restartNeeded(version.CODE, undefined), true)
  // No service yet: nothing to compare.
  assert.equal(version.restartNeeded(version.CODE, null), false)
})
