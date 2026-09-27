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

function serializeSettings(station, volume) {
  return JSON.stringify({ station: station || null, volume: clampVolume(volume) })
}

function parseSettings(raw) {
  var out = { station: null, volume: null }
  var data = null
  try {
    data = JSON.parse(String(raw || "") || "null")
  } catch (e) {
    return out
  }
  if (!data || typeof data !== "object") return out
  if (data.station && typeof data.station === "object") out.station = data.station
  if (data.volume !== undefined && data.volume !== null) out.volume = clampVolume(data.volume)
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
