// NOAA Weather Radio transmitter list: SAME county codes, frequency, site,
// status, and tower coordinates for every transmitter.
//
// Source: NOAA's county coverage data used by the NWR station search,
// https://www.weather.gov/source/nwr/JS/ccl-data.js (`var cclData = [...]`).
// The NWS API /radio list is not usable for this: every row is repeated
// ~64 times, so its 500-row pages hold only 8-9 transmitters each.
//
// The plugin ships data/nwr-transmitters.json (scripts/build-nwr-transmitters.mjs)
// and refreshes from the source when the panel opens.

var CCL_SOURCE = "https://www.weather.gov/source/nwr/JS/ccl-data.js"
var MIN_COMPLETE = 900
var MAX_TRANSMITTERS = 2000

function callOk(call) {
  return /^[A-Z][A-Z0-9]{4,5}$/.test(call)
}

function textOrDrop(value, max) {
  var text = asString(value)
  if (text.length > max) return null
  return text
}

function cleanTransmitter(fields) {
  var call = asString(fields.callSign).toUpperCase()
  if (!callOk(call)) return null
  var siteName = textOrDrop(fields.siteName, 64)
  var siteCity = textOrDrop(fields.siteCity, 64)
  var siteState = textOrDrop(fields.siteState, 2)
  var frequency = textOrDrop(fields.frequency, 16)
  var status = textOrDrop(fields.status, 32)
  if (siteName === null || siteCity === null || siteState === null || frequency === null || status === null) return null
  if (siteState && !/^[A-Z]{2}$/.test(siteState)) return null
  var codes = codeList(fields.sameCodes)
  if (codes.length > 64) return null
  return {
    callSign: call,
    frequency: frequency,
    siteName: siteName,
    siteCity: siteCity,
    siteState: siteState,
    status: status,
    latitude: fields.latitude,
    longitude: fields.longitude,
    sameCodes: codes
  }
}

function asString(value) {
  return value === undefined || value === null ? "" : String(value).replace(/^\s+|\s+$/g, "")
}

function round4(n) {
  return Math.round(n * 10000) / 10000
}

function coord(value, limit) {
  if (value === null || value === undefined || value === "") return null
  var n = typeof value === "number" ? value : parseFloat(value)
  if (!isFinite(n) || Math.abs(n) > limit) return null
  return round4(n)
}

function codeList(value) {
  if (!Array.isArray(value)) return []
  var out = []
  for (var i = 0; i < value.length; i++) {
    var item = value[i]
    var code = asString(item && typeof item === "object" ? item.same : item)
    if (/^\d{6}$/.test(code) && out.indexOf(code) === -1) out.push(code)
  }
  return out
}

function byCallSign(a, b) {
  return a.callSign < b.callSign ? -1 : (a.callSign > b.callSign ? 1 : 0)
}

// Pulls the JSON array literal out of the script and JSON.parses it.
// The script is never evaluated.
function parseCclData(text) {
  var src = String(text || "")
  var start = src.indexOf("[")
  var end = src.lastIndexOf("]")
  if (start === -1 || end <= start) return []
  var data = null
  try {
    data = JSON.parse(src.slice(start, end + 1))
  } catch (e) {
    return []
  }
  if (!Array.isArray(data)) return []
  var out = []
  var seen = {}
  for (var i = 0; i < data.length; i++) {
    var e = data[i]
    if (!e || typeof e !== "object") continue
    var call = asString(e.callsign).toUpperCase()
    if (!call || seen[call]) continue
    var row = cleanTransmitter({
      callSign: call,
      frequency: asString(e.freq),
      siteName: asString(e.sitename),
      siteCity: asString(e.siteloc),
      siteState: asString(e.sitestate).toUpperCase(),
      status: asString(e.status),
      latitude: coord(e.lat, 90),
      longitude: coord(e.lon, 180),
      sameCodes: e.counties
    })
    if (!row) continue
    seen[call] = true
    out.push(row)
    if (out.length > MAX_TRANSMITTERS) break
  }
  out.sort(byCallSign)
  return out
}

// A real download has ~1,036 transmitters; anything far smaller is a
// truncated or changed file and must not replace good data.
function looksComplete(list) {
  return Array.isArray(list) && list.length >= MIN_COMPLETE && list.length <= MAX_TRANSMITTERS
}

function serializeBundle(list, generated) {
  var rows = (Array.isArray(list) ? list : []).map(function (t) {
    return "    " + JSON.stringify({
      callSign: t.callSign,
      frequency: t.frequency,
      siteName: t.siteName,
      siteCity: t.siteCity,
      siteState: t.siteState,
      status: t.status,
      latitude: t.latitude,
      longitude: t.longitude,
      sameCodes: t.sameCodes
    })
  })
  return [
    "{",
    "  \"source\": " + JSON.stringify(CCL_SOURCE) + ",",
    "  \"generated\": " + JSON.stringify(String(generated || "")) + ",",
    "  \"count\": " + rows.length + ",",
    "  \"transmitters\": [",
    rows.join(",\n"),
    "  ]",
    "}",
    ""
  ].join("\n")
}

function parseBundle(raw) {
  var data = null
  try {
    data = JSON.parse(String(raw || "") || "null")
  } catch (e) {
    return []
  }
  var rows = data && typeof data === "object" && Array.isArray(data.transmitters) ? data.transmitters : []
  var out = []
  var seen = {}
  for (var i = 0; i < rows.length; i++) {
    var t = rows[i]
    if (!t || typeof t !== "object") continue
    var call = asString(t.callSign).toUpperCase()
    if (!call || seen[call]) continue
    var row = cleanTransmitter({
      callSign: call,
      frequency: asString(t.frequency),
      siteName: asString(t.siteName),
      siteCity: asString(t.siteCity),
      siteState: asString(t.siteState).toUpperCase(),
      status: asString(t.status),
      latitude: typeof t.latitude === "number" ? coord(t.latitude, 90) : null,
      longitude: typeof t.longitude === "number" ? coord(t.longitude, 180) : null,
      sameCodes: t.sameCodes
    })
    if (!row) continue
    seen[call] = true
    out.push(row)
    if (out.length > MAX_TRANSMITTERS) break
  }
  return out
}

var api = {
  CCL_SOURCE: CCL_SOURCE,
  parseCclData: parseCclData,
  looksComplete: looksComplete,
  serializeBundle: serializeBundle,
  parseBundle: parseBundle
}

if (typeof module !== "undefined" && module.exports) module.exports = api
