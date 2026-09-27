function asString(value) {
  return value === undefined || value === null ? "" : String(value)
}

function mountFromListenUrl(listenurl) {
  var raw = asString(listenurl).replace(/^\s+|\s+$/g, "")
  if (!raw) return ""
  var withoutScheme = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
  var slash = withoutScheme.indexOf("/")
  var path = slash === -1 ? withoutScheme : withoutScheme.slice(slash + 1)
  return path.replace(/^\/+/, "").replace(/\/+$/, "")
}

function parseMount(listenurl) {
  var mount = mountFromListenUrl(listenurl)
  var empty = {
    mount: mount,
    state: "",
    siteName: "",
    callSign: "",
    alt: false,
    altIndex: null
  }
  if (!mount) return empty

  var parts = mount.split("-")
  var alt = false
  var altIndex = null
  var last = parts[parts.length - 1] || ""
  var altMatch = last.match(/^alt(\d*)$/i)
  if (altMatch && parts.length >= 2) {
    alt = true
    altIndex = altMatch[1] === "" ? 0 : Number(altMatch[1])
    if (!isFinite(altIndex)) altIndex = 0
    parts = parts.slice(0, -1)
  }

  var callSign = asString(parts[parts.length - 1]).toUpperCase()
  var state = asString(parts[0]).toUpperCase()
  var siteName = parts.slice(1, -1).join("-")
  return {
    mount: mount,
    state: state,
    siteName: siteName,
    callSign: callSign,
    alt: alt,
    altIndex: altIndex
  }
}

function httpsStreamUrl(listenurl) {
  var mount = mountFromListenUrl(listenurl)
  return mount ? "https://wxradio.org/" + mount : ""
}

function playableStreamUrl(listenurl) {
  var raw = asString(listenurl).replace(/^\s+|\s+$/g, "")
  if (/^https?:\/\//i.test(raw)) return raw
  return httpsStreamUrl(raw)
}

function parseJson(raw) {
  try {
    return JSON.parse(asString(raw) || "null")
  } catch (e) {
    return null
  }
}

function icecastSources(data) {
  if (!data || typeof data !== "object") return []
  var stats = data.icestats
  if (!stats || typeof stats !== "object") return []
  var source = stats.source
  if (!source) return []
  if (Array.isArray(source)) return source
  if (typeof source === "object") return [source]
  return []
}

function parseIcecastStatus(raw) {
  var sources = icecastSources(parseJson(raw))
  var out = []
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i]
    if (!src || typeof src !== "object") continue
    var parsed = parseMount(src.listenurl)
    if (!parsed.callSign) continue
    var listeners = Number(src.listeners)
    var bitrate = Number(src.bitrate)
    out.push({
      callSign: parsed.callSign,
      state: parsed.state,
      siteName: parsed.siteName,
      mount: parsed.mount,
      streamUrl: playableStreamUrl(src.listenurl),
      alt: parsed.alt,
      altIndex: parsed.altIndex,
      listeners: isFinite(listeners) ? listeners : 0,
      bitrate: isFinite(bitrate) ? bitrate : null,
      codec: asString(src.server_type)
    })
  }
  return out
}

// Fresh entries win; previously known call signs missing from the fresh
// list (e.g. transmitters looked up one at a time) are kept.
function mergeByCallSign(fresh, previous) {
  var out = Array.isArray(fresh) ? fresh.slice() : []
  var seen = {}
  var i
  for (i = 0; i < out.length; i++) {
    if (out[i] && out[i].callSign) seen[String(out[i].callSign).toUpperCase()] = true
  }
  var old = Array.isArray(previous) ? previous : []
  for (i = 0; i < old.length; i++) {
    var item = old[i]
    if (!item || !item.callSign) continue
    var key = String(item.callSign).toUpperCase()
    if (seen[key]) continue
    seen[key] = true
    out.push(item)
  }
  return out
}

// A complete NOAA download replaces the transmitter list, so removed
// transmitters disappear. Transmitters looked up one at a time from NWS
// (`lookedUp: true`) survive if NOAA does not list them.
function replaceTransmitters(fresh, current) {
  var extras = []
  var old = Array.isArray(current) ? current : []
  for (var i = 0; i < old.length; i++) {
    if (old[i] && old[i].lookedUp) extras.push(old[i])
  }
  return mergeByCallSign(fresh, extras)
}

var userAgent = "IceStream (https://github.com/JohnicBoom/IceStream)"

// HTTPS for the catalog only. listenurl values inside it stay
// http://wxradio.org:8000/<mount>, which is what mpv must play.
var statusUrl = "https://wxradio.org/status-json.xsl"

var api = {
  statusUrl: statusUrl,
  userAgent: userAgent,
  mergeByCallSign: mergeByCallSign,
  replaceTransmitters: replaceTransmitters,
  parseMount: parseMount,
  httpsStreamUrl: httpsStreamUrl,
  playableStreamUrl: playableStreamUrl,
  parseIcecastStatus: parseIcecastStatus
}

if (typeof module !== "undefined" && module.exports) module.exports = api
