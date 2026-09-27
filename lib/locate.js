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

function nwsPointUrl(lat, lon) {
  function four(n) {
    var x = Number(n)
    if (!isFinite(x)) return null
    return (Math.round(x * 10000) / 10000).toFixed(4)
  }
  var a = four(lat)
  var o = four(lon)
  if (a === null || o === null) return ""
  return "https://api.weather.gov/points/" + a + "," + o
}

function parseNwsPoints(raw) {
  var data = parseJson(raw)
  if (!data || typeof data !== "object") return null
  var properties = data.properties
  if (!properties || typeof properties !== "object") return null
  var nwr = properties.nwr
  if (!nwr || typeof nwr !== "object") return null
  var transmitter = asString(nwr.transmitter).toUpperCase()
  if (!transmitter) return null

  var latitude = null
  var longitude = null
  if (data.geometry && Array.isArray(data.geometry.coordinates) && data.geometry.coordinates.length >= 2) {
    longitude = Number(data.geometry.coordinates[0])
    latitude = Number(data.geometry.coordinates[1])
    if (!isFinite(latitude) || !isFinite(longitude)) {
      latitude = null
      longitude = null
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
    city: asString(relative.city),
    state: asString(relative.state)
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
  if (!callSign) return null
  return {
    callSign: callSign,
    frequency: asString(item.transmitterFrequency),
    siteName: asString(item.siteName),
    siteCity: asString(item.siteCity),
    siteState: asString(item.siteState),
    sameCodes: asStringList(item.sameCodes),
    counties: asStringList(item.counties)
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
  if (station && station.broadcastifyUrl && station.broadcastifyOnline !== false) return "browser-only"
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

// opts: { covering, streams, broadcastify, transmitters, origin, sameCode }
// sameCode is the user's own county (NWS /points nwr.sameCode). Any
// transmitter NWS lists for that county is a candidate. Without it we fall
// back to the covering transmitter's SAME list.
// Transmitters carry NOAA tower coordinates (lib/nwr.js). They win over
// Broadcastify coordinates, which are only a fallback.
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

  var feeds = Array.isArray(opts.broadcastify) ? opts.broadcastify : []
  for (i = 0; i < feeds.length; i++) {
    var feed = feeds[i]
    if (!feed || !feed.callSign) continue
    if (!byCall[upperCall(feed.callSign)] && !sharesCode(feed.sameCodes, codes)) continue
    var target = entry(feed.callSign)
    fill(target, { siteName: feed.title })
    target.broadcastifyUrl = feed.url
    target.broadcastifyOnline = feed.online
    var hasCoords = target.latitude !== undefined && target.latitude !== null
    if (!hasCoords && feed.latitude !== null && feed.latitude !== undefined &&
        feed.longitude !== null && feed.longitude !== undefined) {
      target.latitude = feed.latitude
      target.longitude = feed.longitude
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
    if (!s) return false
    if (s.streamUrl) return true
    if (s.broadcastifyUrl && s.broadcastifyOnline !== false) return true
    return false
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
    var ap = a && a.streamUrl ? 0 : 1
    var bp = b && b.streamUrl ? 0 : 1
    if (ap !== bp) return ap - bp
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
  parseWeatherLocation: parseWeatherLocation,
  parseWttrNearestArea: parseWttrNearestArea,
  parsePlaceQuery: parsePlaceQuery,
  parseNwsTransmitter: parseNwsTransmitter,
  haversineDistanceKm: haversineDistanceKm,
  rankOnlineOptions: rankOnlineOptions,
  buildLocateOptions: buildLocateOptions,
  optionKind: optionKind
}

if (typeof module !== "undefined" && module.exports) module.exports = api
