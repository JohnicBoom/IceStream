function asString(value) {
  return value === undefined || value === null ? "" : String(value)
}

function parseJson(raw) {
  try {
    return JSON.parse(asString(raw) || "null")
  } catch (e) {
    return null
  }
}

function normalizeZip(text) {
  var match = asString(text).match(/^\s*(\d{5})(?:\s*-?\s*\d{4})?\s*$/)
  return match ? match[1] : null
}

function parseZipLookup(raw) {
  var data = parseJson(raw)
  if (!data || typeof data !== "object") return null
  var places = data.places
  if (!Array.isArray(places) || !places.length || !places[0]) return null
  var place = places[0]
  var latitude = parseFloat(place.latitude)
  var longitude = parseFloat(place.longitude)
  if (!isFinite(latitude) || !isFinite(longitude)) return null
  return {
    zip: asString(data["post code"]),
    latitude: latitude,
    longitude: longitude,
    city: asString(place["place name"]),
    state: asString(place["state abbreviation"])
  }
}

function fourDecimal(n, limit) {
  // Reject null and "" before Number(): Number(null) is 0, which is a real place.
  if (typeof n !== "number" || !isFinite(n) || Math.abs(n) > limit) return null
  return (Math.round(n * 10000) / 10000).toFixed(4)
}

function nwsPointParts(lat, lon) {
  var a = fourDecimal(lat, 90)
  var o = fourDecimal(lon, 180)
  if (a === null || o === null) return null
  return { latitude: a, longitude: o }
}

function nwsPointUrl(lat, lon) {
  var parts = nwsPointParts(lat, lon)
  if (!parts) return ""
  return "https://api.weather.gov/points/" + parts.latitude + "," + parts.longitude
}

function nwsRadioUrl(callSign) {
  var call = asString(callSign).toUpperCase()
  if (!/^[A-Z][A-Z0-9]{4,5}$/.test(call)) return ""
  return "https://api.weather.gov/radio/" + call
}

function hasCoords(place) {
  if (!place) return false
  var latitude = fourDecimal(place.latitude, 90)
  var longitude = fourDecimal(place.longitude, 180)
  return latitude !== null && longitude !== null
}

// What to do when the panel opens. A typed ZIP is left alone.
function openPlan(zipText, weather, consent) {
  if (parsePlaceQuery(zipText)) return { kind: "skip" }
  if (hasCoords(weather)) {
    return {
      kind: "coords",
      latitude: Number(weather.latitude),
      longitude: Number(weather.longitude),
      label: asString(weather.name).replace(/^\s+|\s+$/g, "")
    }
  }
  if (consent === true) return { kind: "network" }
  return { kind: "consent" }
}

// What a Find-closest or middle-click should do.
function queryPlan(zipText, weather, consent) {
  var parsed = parsePlaceQuery(zipText)
  if (parsed) return { kind: "zip", zip: parsed.zip }
  if (hasCoords(weather)) {
    return {
      kind: "coords",
      latitude: Number(weather.latitude),
      longitude: Number(weather.longitude),
      label: asString(weather.name).replace(/^\s+|\s+$/g, "")
    }
  }
  if (consent === true) return { kind: "network" }
  return { kind: "consent" }
}

function parseNwsPoints(raw) {
  var data = parseJson(raw)
  if (!data || typeof data !== "object") return null
  var properties = data.properties
  if (!properties || typeof properties !== "object") return null
  var nwr = properties.nwr
  if (!nwr || typeof nwr !== "object") return null
  var transmitter = asString(nwr.transmitter).toUpperCase()
  if (!/^[A-Z][A-Z0-9]{4,5}$/.test(transmitter)) return null

  var latitude = null
  var longitude = null
  if (data.geometry && Array.isArray(data.geometry.coordinates) && data.geometry.coordinates.length >= 2) {
    var rawLon = data.geometry.coordinates[0]
    var rawLat = data.geometry.coordinates[1]
    if (typeof rawLon === "number" && typeof rawLat === "number" && isFinite(rawLon) && isFinite(rawLat)) {
      longitude = rawLon
      latitude = rawLat
    }
  }

  var relative = properties.relativeLocation && properties.relativeLocation.properties
    ? properties.relativeLocation.properties
    : {}

  return {
    transmitter: transmitter,
    sameCode: asString(nwr.sameCode),
    latitude: latitude,
    longitude: longitude,
    city: asString(relative.city).slice(0, 64),
    state: asString(relative.state).slice(0, 2)
  }
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  var out = []
  for (var i = 0; i < value.length; i++) {
    if (value[i] === undefined || value[i] === null) continue
    out.push(String(value[i]))
  }
  return out
}

function parsePlaceQuery(text) {
  var zip = normalizeZip(text)
  return zip ? { kind: "zip", zip: zip } : null
}

function parseNwsTransmitter(raw) {
  var data = parseJson(raw)
  if (!data || typeof data !== "object") return null
  var item = data
  if (Array.isArray(data["@graph"]) && data["@graph"][0]) item = data["@graph"][0]
  var callSign = asString(item.callSign).toUpperCase()
  if (!/^[A-Z][A-Z0-9]{4,5}$/.test(callSign)) return null
  function capped(value, max) {
    var text = asString(value)
    return text.length > max ? "" : text
  }
  var sameCodes = asStringList(item.sameCodes)
  if (sameCodes.length > 64) return null
  return {
    callSign: callSign,
    frequency: capped(item.transmitterFrequency, 16),
    siteName: capped(item.siteName, 64),
    siteCity: capped(item.siteCity, 64),
    siteState: capped(item.siteState, 2),
    sameCodes: sameCodes,
    counties: asStringList(item.counties).slice(0, 64)
  }
}

function toRad(deg) {
  return (deg * Math.PI) / 180
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  var a1 = Number(lat1)
  var o1 = Number(lon1)
  var a2 = Number(lat2)
  var o2 = Number(lon2)
  if (![a1, o1, a2, o2].every(isFinite)) return Infinity
  var r = 6371
  var dLat = toRad(a2 - a1)
  var dLon = toRad(o2 - o1)
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function parseWttrNearestArea(raw) {
  var data = parseJson(raw)
  if (!data || typeof data !== "object") return null
  var areas = data.nearest_area
  if (!Array.isArray(areas) || !areas[0]) return null
  var area = areas[0]
  var latitude = parseFloat(area.latitude)
  var longitude = parseFloat(area.longitude)
  if (!isFinite(latitude) || !isFinite(longitude)) return null
  var name = ""
  if (Array.isArray(area.areaName) && area.areaName[0] && area.areaName[0].value)
    name = asString(area.areaName[0].value)
  return { name: name, latitude: latitude, longitude: longitude }
}

function parseWeatherLocation(raw) {
  var unset = { name: "", latitude: null, longitude: null }
  var data = parseJson(raw)
  if (!data || typeof data !== "object") return unset
  var latitude = parseFloat(data.latitude)
  var longitude = parseFloat(data.longitude)
  var hasCoordinates = isFinite(latitude) && isFinite(longitude)
  return {
    name: asString(data.name).replace(/^\s+|\s+$/g, ""),
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null
  }
}

function optionKind(station) {
  if (station && station.streamUrl) return "available"
  return "offline"
}

function upperCall(value) {
  return asString(value).toUpperCase()
}

function sharesCode(list, codes) {
  if (!Array.isArray(list) || !codes.length) return false
  for (var i = 0; i < list.length; i++) {
    if (codes.indexOf(asString(list[i])) !== -1) return true
  }
  return false
}

// What activating a Closest-stations row should do. Offline rows (no
// Icecast stream) do nothing.
function optionAction(station) {
  if (station && station.streamUrl) return "play"
  return "none"
}

// Closest stations, ranked.
// opts: { covering, streams, transmitters, origin, sameCode }
// sameCode is the user's own county (NWS /points nwr.sameCode). Any
// transmitter whose SAME codes include it (NOAA data, lib/nwr.js) is a
// candidate. Without it we fall back to the covering transmitter's SAME list.
// Transmitters carry NOAA tower coordinates. Playable Icecast mounts come
// first, then nearest tower.
function buildLocateOptions(opts) {
  opts = opts || {}
  var covering = opts.covering || null
  var codes = opts.sameCode
    ? [asString(opts.sameCode)]
    : asStringList(covering && covering.sameCodes)
  var byCall = {}

  function entry(callSign) {
    var key = upperCall(callSign)
    if (!byCall[key]) byCall[key] = { callSign: key }
    return byCall[key]
  }
  function fill(target, partial) {
    for (var field in partial) {
      var value = partial[field]
      if (value === undefined || value === null || value === "") continue
      if (target[field] === undefined || target[field] === null || target[field] === "") target[field] = value
    }
  }

  if (covering && covering.callSign) {
    var cov = entry(covering.callSign)
    cov.covering = true
    fill(cov, {
      siteName: covering.siteName,
      siteCity: covering.siteCity,
      siteState: covering.siteState,
      frequency: covering.frequency,
      streamUrl: covering.streamUrl,
      mount: covering.mount
    })
  }

  var i
  var transmitters = Array.isArray(opts.transmitters) ? opts.transmitters : []
  for (i = 0; i < transmitters.length; i++) {
    var tx = transmitters[i]
    if (!tx || !tx.callSign) continue
    var known = !!byCall[upperCall(tx.callSign)]
    if (!known && !sharesCode(tx.sameCodes, codes)) continue
    var txEntry = entry(tx.callSign)
    fill(txEntry, {
      siteName: tx.siteName,
      siteCity: tx.siteCity,
      siteState: tx.siteState,
      frequency: tx.frequency
    })
    if (isFinite(parseFloat(tx.latitude)) && isFinite(parseFloat(tx.longitude))) {
      txEntry.latitude = Number(tx.latitude)
      txEntry.longitude = Number(tx.longitude)
    }
  }

  var streams = Array.isArray(opts.streams) ? opts.streams : []
  for (i = 0; i < streams.length; i++) {
    var s = streams[i]
    if (!s || !s.callSign || !s.streamUrl) continue
    var station = byCall[upperCall(s.callSign)]
    if (!station) continue
    fill(station, { siteName: s.siteName, siteState: s.state })
    // Prefer a primary mount over -alt; keep what is already set otherwise.
    if (!station.streamUrl || (station.alt && !s.alt)) {
      station.streamUrl = s.streamUrl
      station.mount = s.mount || null
      station.alt = !!s.alt
    }
  }

  var stations = []
  for (var key in byCall) stations.push(byCall[key])
  return rankOnlineOptions(opts.origin, stations)
}

function rankOnlineOptions(origin, stations) {
  var lat = origin ? Number(origin.latitude) : NaN
  var lon = origin ? Number(origin.longitude) : NaN
  var list = Array.isArray(stations) ? stations.slice() : []
  function working(s) {
    return !!(s && s.streamUrl)
  }
  function distance(s) {
    if (!s || s.latitude === undefined || s.latitude === null || s.longitude === undefined || s.longitude === null)
      return Infinity
    return haversineDistanceKm(lat, lon, s.latitude, s.longitude)
  }
  list.sort(function (a, b) {
    var aw = working(a) ? 0 : 1
    var bw = working(b) ? 0 : 1
    if (aw !== bw) return aw - bw
    var ad = distance(a)
    var bd = distance(b)
    if (ad !== bd) return ad < bd ? -1 : 1
    if (a && a.covering && !(b && b.covering)) return -1
    if (b && b.covering && !(a && a.covering)) return 1
    var ac = upperCall(a && a.callSign)
    var bc = upperCall(b && b.callSign)
    return ac < bc ? -1 : (ac > bc ? 1 : 0)
  })
  return list
}

var api = {
  normalizeZip: normalizeZip,
  parseZipLookup: parseZipLookup,
  parseNwsPoints: parseNwsPoints,
  nwsPointUrl: nwsPointUrl,
  nwsPointParts: nwsPointParts,
  nwsRadioUrl: nwsRadioUrl,
  openPlan: openPlan,
  queryPlan: queryPlan,
  parseWeatherLocation: parseWeatherLocation,
  parseWttrNearestArea: parseWttrNearestArea,
  parsePlaceQuery: parsePlaceQuery,
  parseNwsTransmitter: parseNwsTransmitter,
  haversineDistanceKm: haversineDistanceKm,
  rankOnlineOptions: rankOnlineOptions,
  buildLocateOptions: buildLocateOptions,
  optionKind: optionKind,
  optionAction: optionAction
}

if (typeof module !== "undefined" && module.exports) module.exports = api
