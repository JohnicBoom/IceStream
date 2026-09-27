#!/usr/bin/env node
// Regenerates data/nwr-transmitters.json from NOAA's NWR county coverage
// data. The plugin also refreshes from the same source daily at runtime;
// rerun this before a release so fresh installs start current:
//   node scripts/build-nwr-transmitters.mjs
import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const nwr = require(join(root, "lib/nwr.js"))

const res = await fetch(nwr.CCL_SOURCE, {
  headers: { "User-Agent": "IceStream (https://github.com/JohnicBoom/IceStream)" }
})
if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
const list = nwr.parseCclData(await res.text())
if (!nwr.looksComplete(list)) throw new Error(`only ${list.length} transmitters parsed; refusing to write`)

const out = join(root, "data/nwr-transmitters.json")
writeFileSync(out, nwr.serializeBundle(list, new Date().toISOString().slice(0, 10)))
const withCoords = list.filter((t) => t.latitude !== null && t.longitude !== null).length
console.log(`wrote ${list.length} transmitters (${withCoords} with tower coordinates) to ${out}`)
