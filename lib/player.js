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

function pause(state) {
  var next = copy(state || initialState())
  if (next.status !== "playing") return next
  next.status = "paused"
  return next
}

function resume(state) {
  var next = copy(state || initialState())
  if (next.status !== "paused") return next
  next.status = "playing"
  next.error = null
  return next
}

function stop(state) {
  var next = copy(state || initialState())
  next.status = "idle"
  next.error = null
  return next
}

function togglePlay(state, station) {
  var current = state || initialState()
  if (current.status === "playing" || current.status === "connecting" || current.status === "paused")
    return stop(current)
  return play(current, station || current.station)
}

var api = {
  initialState: initialState,
  play: play,
  playAck: playAck,
  playFail: playFail,
  pause: pause,
  resume: resume,
  stop: stop,
  togglePlay: togglePlay
}

if (typeof module !== "undefined" && module.exports) module.exports = api
