function asString(value) {
  return value === undefined || value === null ? "" : String(value)
}

function preferStream(streams) {
  var list = Array.isArray(streams) ? streams.slice() : []
  if (!list.length) return null
  list.sort(function (a, b) {
    var aAlt = a && a.alt ? 1 : 0
    var bAlt = b && b.alt ? 1 : 0
    if (aAlt !== bAlt) return aAlt - bAlt
    var aIdx = a && a.altIndex !== null && a.altIndex !== undefined ? Number(a.altIndex) : 0
    var bIdx = b && b.altIndex !== null && b.altIndex !== undefined ? Number(b.altIndex) : 0
    if (aIdx !== bIdx) return aIdx - bIdx
    var aLis = a && isFinite(Number(a.listeners)) ? Number(a.listeners) : 0
    var bLis = b && isFinite(Number(b.listeners)) ? Number(b.listeners) : 0
    return bLis - aLis
  })
  return list[0]
}

function streamsForCallSign(streams, callSign) {
  var needle = asString(callSign).toUpperCase()
  if (!needle) return []
  var list = Array.isArray(streams) ? streams : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i] && asString(list[i].callSign).toUpperCase() === needle) out.push(list[i])
  }
  return out
}

function findTransmitter(transmitters, callSign) {
  var needle = asString(callSign).toUpperCase()
  if (!needle) return null
  var list = Array.isArray(transmitters) ? transmitters : []
  for (var i = 0; i < list.length; i++) {
    if (list[i] && asString(list[i].callSign).toUpperCase() === needle) return list[i]
  }
  return null
}

function mergeStation(transmitter, stream) {
  if (!transmitter) return null
  return {
    callSign: asString(transmitter.callSign).toUpperCase(),
    frequency: asString(transmitter.frequency),
    siteName: asString(transmitter.siteName),
    siteCity: asString(transmitter.siteCity),
    siteState: asString(transmitter.siteState),
    sameCodes: transmitter.sameCodes && transmitter.sameCodes.length ? transmitter.sameCodes.slice() : [],
    streamUrl: stream && stream.streamUrl ? stream.streamUrl : null,
    mount: stream && stream.mount ? stream.mount : null,
    alt: !!(stream && stream.alt)
  }
}

function fallbackStation(covering, transmitters, streams) {
  var state = asString(covering && covering.siteState).toUpperCase()
  if (!state) return null
  var list = Array.isArray(streams) ? streams : []
  var same = []
  for (var i = 0; i < list.length; i++) {
    var s = list[i]
    if (!s || asString(s.callSign).toUpperCase() === asString(covering.callSign).toUpperCase()) continue
    if (asString(s.state).toUpperCase() === state) same.push(s)
  }
  var preferred = preferStream(same)
  if (!preferred) return null
  var meta = findTransmitter(transmitters, preferred.callSign) || {
    callSign: preferred.callSign,
    frequency: "",
    siteName: preferred.siteName,
    siteCity: "",
    siteState: preferred.state
  }
  return mergeStation(meta, preferred)
}

function resolveCovering(callSign, transmitters, streams) {
  var covering = findTransmitter(transmitters, callSign)
  var stream = preferStream(streamsForCallSign(streams, callSign))
  if (!covering && stream) {
    covering = {
      callSign: stream.callSign,
      frequency: "",
      siteName: stream.siteName,
      siteCity: "",
      siteState: stream.state,
      sameCodes: [],
      counties: []
    }
  }
  if (!covering) {
    return { covering: null, station: null, streamUrl: null, fallback: null }
  }
  var station = mergeStation(covering, stream)
  return {
    covering: covering,
    station: station,
    streamUrl: station.streamUrl,
    fallback: stream ? null : fallbackStation(covering, transmitters, streams)
  }
}

function preferNearby(streams, opts) {
  opts = opts || {}
  var state = asString(opts.state).toUpperCase()
  var preferred = {}
  var calls = opts.preferredCallSigns || []
  for (var i = 0; i < calls.length; i++) preferred[asString(calls[i]).toUpperCase()] = true
  var list = Array.isArray(streams) ? streams.slice() : []
  list.sort(function (a, b) {
    var aCall = asString(a && a.callSign).toUpperCase()
    var bCall = asString(b && b.callSign).toUpperCase()
    var aPref = preferred[aCall] ? 0 : 1
    var bPref = preferred[bCall] ? 0 : 1
    if (aPref !== bPref) return aPref - bPref
    var aState = state && asString(a && a.state).toUpperCase() === state ? 0 : 1
    var bState = state && asString(b && b.state).toUpperCase() === state ? 0 : 1
    if (aState !== bState) return aState - bState
    var aName = asString(a && a.siteName)
    var bName = asString(b && b.siteName)
    if (aName < bName) return -1
    if (aName > bName) return 1
    if (aCall < bCall) return -1
    if (aCall > bCall) return 1
    return 0
  })
  return list
}

function filterStreams(streams, query) {
  var q = asString(query).replace(/^\s+|\s+$/g, "").toLowerCase()
  var list = Array.isArray(streams) ? streams : []
  if (!q) return list
  var out = []
  for (var i = 0; i < list.length; i++) {
    var s = list[i]
    if (!s) continue
    var hay = [s.callSign, s.siteName, s.state, s.mount].join(" ").toLowerCase()
    if (hay.indexOf(q) !== -1) out.push(s)
  }
  return out
}

var api = {
  preferStream: preferStream,
  resolveCovering: resolveCovering,
  filterStreams: filterStreams,
  preferNearby: preferNearby
}

if (typeof module !== "undefined" && module.exports) module.exports = api
