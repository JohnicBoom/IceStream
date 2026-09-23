import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const spectrum = require("../lib/spectrum.js")
const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function sine(freq, rate, n) {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / rate)
  return out
}

test("bandsFromPcm returns 16 log-spaced bands", () => {
  const bands = spectrum.bandsFromPcm(sine(1000, spectrum.SAMPLE_RATE, spectrum.FFT_SIZE))
  assert.equal(bands.length, 16)
})

test("silence stays near zero across every band", () => {
  const bands = spectrum.bandsFromPcm(new Float32Array(spectrum.FFT_SIZE))
  for (const value of bands) {
    assert.ok(value >= 0)
    assert.ok(value < 0.05, "silence band was " + value)
  }
})

test("a 1 kHz sine peaks in the band that contains 1 kHz", () => {
  const bands = spectrum.bandsFromPcm(sine(1000, spectrum.SAMPLE_RATE, spectrum.FFT_SIZE))
  const peak = bands.indexOf(Math.max(...bands))
  assert.equal(peak, spectrum.bandIndexForFrequency(1000))
  assert.ok(bands[peak] > 0.5)
  assert.ok(bands[peak] > bands[0])
  assert.ok(bands[peak] > bands[15])
})

test("icestream-analyze writes one JSON line of 16 bands per FFT frame", () => {
  const pcm = sine(1000, spectrum.SAMPLE_RATE, spectrum.FFT_SIZE)
  const result = spawnSync(process.execPath, [join(root, "bin/icestream-analyze.mjs")], {
    input: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength),
    encoding: "utf8"
  })
  assert.equal(result.status, 0, result.stderr)
  const line = result.stdout.trim().split("\n")[0]
  const parsed = JSON.parse(line)
  assert.equal(parsed.bands.length, 16)
  const peak = parsed.bands.indexOf(Math.max(...parsed.bands))
  assert.equal(peak, spectrum.bandIndexForFrequency(1000))
})
