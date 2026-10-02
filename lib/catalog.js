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

// A playable mount is a short path on the wxradio relay. One slash is
// allowed (MA-Bourne/Hyannis-KEC73). ".." and a second slash are not.
function safeMount(mount) {
  if (!mount || mount.length > 80) return false
  if (!/^[A-Za-z0-9._~/-]+$/.test(mount)) return false
  if (mount.indexOf("//") !== -1) return false
  var parts = mount.split("/")
  if (parts.length > 2) return false
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i] || parts[i] === "." || parts[i] === "..") return false
  }
  return true
}

// The only address mpv may open. https://wxradio.org/<mount> and a bare
// mount are rewritten to the port-8000 relay. Every other host is refused.
function playableStreamUrl(listenurl) {
  var raw = asString(listenurl).replace(/^\s+|\s+$/g, "")
  if (!raw || raw.length > 300) return ""
  var mount = ""
  var scheme = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)
  if (scheme) {
    var name = scheme[1].toLowerCase()
    if (name !== "http" && name !== "https") return ""
    var rest = raw.slice(scheme[0].length)
    if (rest.indexOf("@") !== -1 || rest.indexOf("?") !== -1 || rest.indexOf("#") !== -1 || rest.indexOf("\\") !== -1 || /[\s\u0000-\u001f\u007f]/.test(rest)) return ""
    var slash = rest.indexOf("/")
    var authority = (slash === -1 ? rest : rest.slice(0, slash)).toLowerCase()
    var path = slash === -1 ? "" : rest.slice(slash + 1)
    var host = authority
    var port = name === "https" ? "443" : "80"
    var colon = authority.lastIndexOf(":")
    if (colon !== -1) {
      host = authority.slice(0, colon)
      port = authority.slice(colon + 1)
      if (!/^\d+$/.test(port)) return ""
    }
    if (host !== "wxradio.org") return ""
    if (port !== "80" && port !== "443" && port !== "8000") return ""
    mount = path
  } else {
    if (/[:@?#\\\s\u0000-\u001f\u007f]/.test(raw)) return ""
    mount = raw
  }
  mount = mount.replace(/^\/+/, "").replace(/\/+$/, "")
  if (!safeMount(mount)) return ""
  return "http://wxradio.org:8000/" + mount
}

function isCallSign(value) {
  return /^[A-Z][A-Z0-9]{4,5}$/.test(asString(value))
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
  // A hostile catalog must not become a model. Reject the whole body.
  if (sources.length > 500) return []
  var out = []
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i]
    if (!src || typeof src !== "object") continue
    var streamUrl = playableStreamUrl(src.listenurl)
    if (!streamUrl) continue
    var parsed = parseMount(streamUrl)
    if (!isCallSign(parsed.callSign)) continue
    if (!/^[A-Z]{2}$/.test(parsed.state)) continue
    if (parsed.siteName.length > 64) continue
    var listeners = Number(src.listeners)
    var bitrate = Number(src.bitrate)
    var codec = asString(src.server_type)
    if (codec.length > 40) codec = ""
    out.push({
      callSign: parsed.callSign,
      state: parsed.state,
      siteName: parsed.siteName,
      mount: parsed.mount,
      streamUrl: streamUrl,
      alt: parsed.alt,
      altIndex: parsed.altIndex,
      listeners: isFinite(listeners) ? listeners : 0,
      bitrate: isFinite(bitrate) ? bitrate : null,
      codec: codec
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
