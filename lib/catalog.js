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

function asStringList(value) {
  if (!Array.isArray(value)) return []
  var out = []
  for (var i = 0; i < value.length; i++) {
    if (value[i] === undefined || value[i] === null) continue
    out.push(String(value[i]))
  }
  return out
}

function parseNwsRadioList(raw) {
  var data = parseJson(raw)
  var empty = { transmitters: [], next: null }
  if (!data || typeof data !== "object") return empty

  var graph = Array.isArray(data["@graph"]) ? data["@graph"] : []
  var transmitters = []
  for (var i = 0; i < graph.length; i++) {
    var item = graph[i]
    if (!item || typeof item !== "object") continue
    var callSign = asString(item.callSign).toUpperCase()
    if (!callSign) continue
    transmitters.push({
      callSign: callSign,
      frequency: asString(item.transmitterFrequency),
      siteName: asString(item.siteName),
      siteCity: asString(item.siteCity),
      siteState: asString(item.siteState),
      sameCodes: asStringList(item.sameCodes),
      counties: asStringList(item.counties)
    })
  }

  var next = null
  if (data.pagination && typeof data.pagination === "object") {
    var cursor = asString(data.pagination.next)
    if (cursor) next = cursor
  }
  return { transmitters: transmitters, next: next }
}

var api = {
  parseMount: parseMount,
  httpsStreamUrl: httpsStreamUrl,
  playableStreamUrl: playableStreamUrl,
  parseIcecastStatus: parseIcecastStatus,
  parseNwsRadioList: parseNwsRadioList
}

if (typeof module !== "undefined" && module.exports) module.exports = api
