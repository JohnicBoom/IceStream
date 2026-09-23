var BAND_COUNT = 16
var SAMPLE_RATE = 22050
var FFT_SIZE = 1024
var MIN_HZ = 20
var MIN_DB = -80
var EPS = 1e-12

function bandEdges(sampleRate) {
  var nyquist = (sampleRate || SAMPLE_RATE) / 2
  var edges = []
  for (var i = 0; i <= BAND_COUNT; i++) {
    edges.push(MIN_HZ * Math.pow(nyquist / MIN_HZ, i / BAND_COUNT))
  }
  return edges
}

function bandIndexForFrequency(hz, sampleRate) {
  var edges = bandEdges(sampleRate)
  var freq = Number(hz)
  if (!isFinite(freq) || freq <= edges[0]) return 0
  for (var i = 0; i < BAND_COUNT; i++) {
    if (freq < edges[i + 1]) return i
  }
  return BAND_COUNT - 1
}

function bitReversePermute(real, imag) {
  var n = real.length
  for (var i = 1, j = 0; i < n; i++) {
    var bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      var tr = real[i]
      real[i] = real[j]
      real[j] = tr
      var ti = imag[i]
      imag[i] = imag[j]
      imag[j] = ti
    }
  }
}

function fft(real, imag) {
  var n = real.length
  bitReversePermute(real, imag)
  for (var len = 2; len <= n; len <<= 1) {
    var angle = (-2 * Math.PI) / len
    var wlenRe = Math.cos(angle)
    var wlenIm = Math.sin(angle)
    var half = len >> 1
    for (var i = 0; i < n; i += len) {
      var wRe = 1
      var wIm = 0
      for (var k = 0; k < half; k++) {
        var even = i + k
        var odd = even + half
        var vRe = real[odd] * wRe - imag[odd] * wIm
        var vIm = real[odd] * wIm + imag[odd] * wRe
        real[odd] = real[even] - vRe
        imag[odd] = imag[even] - vIm
        real[even] += vRe
        imag[even] += vIm
        var nextRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nextRe
      }
    }
  }
}

function clamp01(value) {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function bandsFromPcm(samples, sampleRate) {
  var rate = sampleRate || SAMPLE_RATE
  var real = new Array(FFT_SIZE)
  var imag = new Array(FFT_SIZE)
  var i
  for (i = 0; i < FFT_SIZE; i++) {
    var sample = samples && i < samples.length ? Number(samples[i]) : 0
    if (!isFinite(sample)) sample = 0
    var window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)))
    real[i] = sample * window
    imag[i] = 0
  }
  fft(real, imag)

  var edges = bandEdges(rate)
  var peaks = []
  for (i = 0; i < BAND_COUNT; i++) peaks[i] = 0
  var bins = FFT_SIZE / 2
  var scale = FFT_SIZE / 2
  for (i = 0; i < bins; i++) {
    var hz = (i * rate) / FFT_SIZE
    if (hz < MIN_HZ) continue
    var mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / scale
    var band = bandIndexForFrequency(hz, rate)
    if (mag > peaks[band]) peaks[band] = mag
  }

  var bands = []
  for (i = 0; i < BAND_COUNT; i++) {
    var db = (20 * Math.log(peaks[i] + EPS)) / Math.LN10
    bands.push(clamp01((db - MIN_DB) / -MIN_DB))
  }
  return bands
}

function peakFromPcm(samples) {
  var peak = 0
  var n = samples ? samples.length : 0
  for (var i = 0; i < n; i++) {
    var v = Number(samples[i])
    if (!isFinite(v)) continue
    if (v < 0) v = -v
    if (v > peak) peak = v
  }
  return peak
}

var api = {
  BAND_COUNT: BAND_COUNT,
  SAMPLE_RATE: SAMPLE_RATE,
  FFT_SIZE: FFT_SIZE,
  bandIndexForFrequency: bandIndexForFrequency,
  bandsFromPcm: bandsFromPcm,
  peakFromPcm: peakFromPcm
}

if (typeof module !== "undefined" && module.exports) module.exports = api
