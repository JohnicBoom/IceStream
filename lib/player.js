function initialState() {
  return {
    status: "idle",
    station: null,
    playToken: 0,
    error: null
  }
}

function copy(state) {
  return {
    status: state.status,
    station: state.station,
    playToken: state.playToken,
    error: state.error
  }
}

function play(state, station) {
  var next = copy(state || initialState())
  next.status = "connecting"
  next.station = station || null
  next.playToken = (state && state.playToken ? state.playToken : 0) + 1
  next.error = null
  return next
}

function tokenMatches(state, token) {
  return state && Number(token) === Number(state.playToken)
}

function playAck(state, token) {
  if (!tokenMatches(state, token)) return copy(state)
  var next = copy(state)
  next.status = "playing"
  next.error = null
  return next
}

function playFail(state, token, message) {
  if (!tokenMatches(state, token)) return copy(state)
  var next = copy(state)
  next.status = "error"
  next.error = message === undefined || message === null ? "" : String(message)
  return next
}

function stop(state) {
  var next = copy(state || initialState())
  next.status = "idle"
  next.error = null
  return next
}

function withStation(state, station) {
  var next = copy(state || initialState())
  next.station = station || null
  return next
}

function isActive(state) {
  return !!state && (state.status === "playing" || state.status === "connecting")
}

function isActiveStream(state, streamUrl) {
  if (!isActive(state) || !state.station || !streamUrl) return false
  return String(state.station.streamUrl || "") === String(streamUrl)
}

function clampVolume(value) {
  var n = Math.round(Number(value))
  if (!isFinite(n)) return null
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

// Same rule as lib/catalog.js playableStreamUrl. Kept here so a saved
// settings file is checked without a second import (QML loads each file alone).
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

function playableStreamUrl(listenurl) {
  var raw = listenurl === undefined || listenurl === null ? "" : String(listenurl).replace(/^\s+|\s+$/g, "")
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

function fieldText(value, max) {
  if (value === undefined || value === null || value === "") return ""
  var text = String(value)
  if (text.length > max) return null
  return text
}

function cleanStation(station) {
  if (!station || typeof station !== "object") return null
  var callSign = String(station.callSign || "").toUpperCase()
  if (!/^[A-Z][A-Z0-9]{4,5}$/.test(callSign)) return null
  var streamUrl = playableStreamUrl(station.streamUrl)
  if (!streamUrl) return null
  var siteName = fieldText(station.siteName, 64)
  var siteCity = fieldText(station.siteCity, 64)
  var siteState = fieldText(station.siteState, 2)
  var frequency = fieldText(station.frequency, 16)
  var mount = fieldText(station.mount, 80)
  if (siteName === null || siteCity === null || siteState === null || frequency === null || mount === null) return null
  if (siteState && !/^[A-Z]{2}$/.test(siteState)) return null
  var out = { callSign: callSign, streamUrl: streamUrl }
  if (siteName) out.siteName = siteName
  if (siteCity) out.siteCity = siteCity
  if (siteState) out.siteState = siteState
  if (frequency) out.frequency = frequency
  if (mount) out.mount = mount
  return out
}

function serializeSettings(station, volume, networkLocate) {
  return JSON.stringify({
    station: cleanStation(station),
    volume: clampVolume(volume),
    networkLocate: !!networkLocate
  })
}

function parseSettings(raw) {
  var out = { station: null, volume: null, networkLocate: false }
  var data = null
  try {
    data = JSON.parse(String(raw || "") || "null")
  } catch (e) {
    return out
  }
  if (!data || typeof data !== "object") return out
  if (data.station && typeof data.station === "object") out.station = cleanStation(data.station)
  if (data.volume !== undefined && data.volume !== null) out.volume = clampVolume(data.volume)
  out.networkLocate = data.networkLocate === true
  return out
}

var api = {
  initialState: initialState,
  play: play,
  playAck: playAck,
  playFail: playFail,
  stop: stop,
  withStation: withStation,
  isActive: isActive,
  isActiveStream: isActiveStream,
  clampVolume: clampVolume,
  serializeSettings: serializeSettings,
  parseSettings: parseSettings
}

if (typeof module !== "undefined" && module.exports) module.exports = api
