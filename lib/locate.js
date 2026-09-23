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
  var raw = asString(text).replace(/^\s+|\s+$/g, "")
  if (!raw) return null
  var zip = normalizeZip(raw)
  if (zip) return { kind: "zip", zip: zip, name: "", state: null }
  var state = null
  var name = raw
  var comma = raw.match(/^(.*?)[,]\s*([A-Za-z]{2})$/)
  var space = raw.match(/^(.*?)\s+([A-Za-z]{2})$/)
  var tagged = comma || space
  if (tagged && tagged[1].replace(/^\s+|\s+$/g, "")) {
    name = tagged[1].replace(/^\s+|\s+$/g, "")
    state = tagged[2].toUpperCase()
  }
  return { kind: "city", zip: null, name: name, state: state }
}

function geocodeScore(result, stateHint) {
  var score = 0
  var code = asString(result.country_code).toUpperCase()
  if (code === "US") score += 8
  var feature = asString(result.feature_code)
  if (feature === "PPL" || feature === "PPLA" || feature === "PPLA2" || feature === "PPLA3") score += 4
  else if (feature === "PPLX") score += 1
  var admin = asString(result.admin1)
  var hint = asString(stateHint).toUpperCase()
  if (hint) {
    var aliases = {
      IL: "ILLINOIS", NY: "NEW YORK", CA: "CALIFORNIA", TX: "TEXAS", FL: "FLORIDA",
      PA: "PENNSYLVANIA", OH: "OHIO", GA: "GEORGIA", NC: "NORTH CAROLINA", MI: "MICHIGAN",
      NJ: "NEW JERSEY", VA: "VIRGINIA", WA: "WASHINGTON", AZ: "ARIZONA", MA: "MASSACHUSETTS",
      TN: "TENNESSEE", IN: "INDIANA", MO: "MISSOURI", MD: "MARYLAND", WI: "WISCONSIN",
      MN: "MINNESOTA", CO: "COLORADO", AL: "ALABAMA", SC: "SOUTH CAROLINA", LA: "LOUISIANA",
      KY: "KENTUCKY", OR: "OREGON", OK: "OKLAHOMA", CT: "CONNECTICUT", IA: "IOWA",
      MS: "MISSISSIPPI", AR: "ARKANSAS", KS: "KANSAS", UT: "UTAH", NV: "NEVADA",
      NM: "NEW MEXICO", NE: "NEBRASKA", WV: "WEST VIRGINIA", ID: "IDAHO", HI: "HAWAII",
      NH: "NEW HAMPSHIRE", ME: "MAINE", MT: "MONTANA", RI: "RHODE ISLAND", DE: "DELAWARE",
      SD: "SOUTH DAKOTA", ND: "NORTH DAKOTA", AK: "ALASKA", VT: "VERMONT", WY: "WYOMING",
      DC: "DISTRICT OF COLUMBIA"
    }
    var adminUpper = admin.toUpperCase()
    if (adminUpper === hint || adminUpper === (aliases[hint] || "")) score += 6
  }
  if (isFinite(Number(result.population))) score += Math.min(2, Number(result.population) / 50000)
  return score
}

function parseGeocodingResults(raw, stateHint) {
  var data = parseJson(raw)
  if (!data || typeof data !== "object" || !Array.isArray(data.results) || !data.results.length) return null
  var best = null
  var bestScore = -1
  for (var i = 0; i < data.results.length; i++) {
    var r = data.results[i]
    if (!r || r.latitude === undefined || r.longitude === undefined) continue
    var lat = Number(r.latitude)
    var lon = Number(r.longitude)
    if (!isFinite(lat) || !isFinite(lon)) continue
    var score = geocodeScore(r, stateHint)
    if (score > bestScore) {
      bestScore = score
      best = {
        name: asString(r.name),
        state: asString(r.admin1),
        latitude: lat,
        longitude: lon
      }
    }
  }
  return best
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

function rankOnlineOptions(origin, stations) {
  var lat = origin && Number(origin.latitude)
  var lon = origin && Number(origin.longitude)
  var list = Array.isArray(stations) ? stations.slice() : []
  function working(s) {
    if (!s) return false
    if (s.streamUrl) return true
    if (s.broadcastifyUrl && s.broadcastifyOnline !== false) return true
    return false
  }
  list.sort(function (a, b) {
    var aw = working(a) ? 0 : 1
    var bw = working(b) ? 0 : 1
    if (aw !== bw) return aw - bw
    var ad = haversineDistanceKm(lat, lon, a && a.latitude, a && a.longitude)
    var bd = haversineDistanceKm(lat, lon, b && b.latitude, b && b.longitude)
    if (ad !== bd) return ad - bd
    if (a && a.covering && !(b && b.covering)) return -1
    if (b && b.covering && !(a && a.covering)) return 1
    return 0
  })
  return list
}

var api = {
  normalizeZip: normalizeZip,
  parseZipLookup: parseZipLookup,
  parseNwsPoints: parseNwsPoints,
  parseWeatherLocation: parseWeatherLocation,
  parsePlaceQuery: parsePlaceQuery,
  parseGeocodingResults: parseGeocodingResults,
  parseNwsTransmitter: parseNwsTransmitter,
  haversineDistanceKm: haversineDistanceKm,
  rankOnlineOptions: rankOnlineOptions
}

if (typeof module !== "undefined" && module.exports) module.exports = api
