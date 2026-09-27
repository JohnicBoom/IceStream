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

function listenUrl(feedId) {
  var id = Number(feedId)
  if (!isFinite(id) || id <= 0 || Math.floor(id) !== id) return null
  return "https://www.broadcastify.com/listen/feed/" + id
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  var out = []
  for (var i = 0; i < value.length; i++) {
    if (value[i] === undefined || value[i] === null) continue
    var s = String(value[i]).replace(/^\s+|\s+$/g, "")
    if (s) out.push(s)
  }
  return out
}

function parseCatalog(raw) {
  var data = parseJson(raw)
  if (!Array.isArray(data)) return []
  var out = []
  for (var i = 0; i < data.length; i++) {
    var item = data[i]
    if (!item || typeof item !== "object") continue
    var callSign = asString(item.callSign).toUpperCase()
    var feedId = Number(item.feedId)
    if (!callSign || !isFinite(feedId) || feedId <= 0) continue
    var online = null
    if (item.online === true) online = true
    else if (item.online === false) online = false
    var latitude = Number(item.latitude)
    var longitude = Number(item.longitude)
    out.push({
      callSign: callSign,
      feedId: feedId,
      title: asString(item.title),
      sameCodes: asStringList(item.sameCodes),
      url: listenUrl(feedId),
      online: online,
      latitude: isFinite(latitude) ? latitude : null,
      longitude: isFinite(longitude) ? longitude : null
    })
  }
  return out
}

var api = {
  listenUrl: listenUrl,
  parseCatalog: parseCatalog
}

if (typeof module !== "undefined" && module.exports) module.exports = api
