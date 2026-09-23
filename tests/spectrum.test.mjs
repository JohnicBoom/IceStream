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

test("relativeBands is unchanged if the whole frame is scaled", () => {
  const shape = [0.1, 0.4, 0.2, 0.05]
  const quiet = shape.map((v) => v * 0.4)
  const loud = shape.map((v) => v * 0.9)
  const a = spectrum.relativeBands(quiet)
  const b = spectrum.relativeBands(loud)
  for (let i = 0; i < shape.length; i++) {
    assert.ok(Math.abs(a[i] - b[i]) < 1e-9)
  }
  assert.ok(Math.abs(a[1] - 1) < 1e-9)
})

test("displayPeak undoes slider gain so 40% and 90% look the same", () => {
  const source = 0.2
  const at40 = spectrum.displayPeak(source * 0.4, 40)
  const at90 = spectrum.displayPeak(source * 0.9, 90)
  assert.ok(Math.abs(at40 - source) < 1e-9)
  assert.ok(Math.abs(at90 - source) < 1e-9)
})

test("peakFromPcm is zero for silence and near one for a full-scale sine", () => {
  assert.equal(spectrum.peakFromPcm(new Float32Array(512)), 0)
  const samples = new Float32Array(512)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * i) / 32)
  assert.ok(spectrum.peakFromPcm(samples) > 0.9)
})

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
