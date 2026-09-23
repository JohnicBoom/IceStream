#!/usr/bin/env node
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const spectrum = require(join(dirname(fileURLToPath(import.meta.url)), "../lib/spectrum.js"))

const frameBytes = spectrum.FFT_SIZE * 4
let pending = Buffer.alloc(0)

function emitFrame(buf) {
  const samples = new Float32Array(buf.buffer, buf.byteOffset, spectrum.FFT_SIZE)
  const bands = spectrum.relativeBands(spectrum.bandsFromPcm(samples, spectrum.SAMPLE_RATE))
  process.stdout.write(JSON.stringify({ bands: bands }) + "\n")
}

process.stdin.on("data", (chunk) => {
  pending = Buffer.concat([pending, chunk])
  while (pending.length >= frameBytes) {
    emitFrame(pending.subarray(0, frameBytes))
    pending = pending.subarray(frameBytes)
  }
})

process.stdin.on("end", () => {
  process.exit(0)
})
