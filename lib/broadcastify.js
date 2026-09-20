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
    out.push({
      callSign: callSign,
      feedId: feedId,
      title: asString(item.title),
      sameCodes: asStringList(item.sameCodes),
      url: listenUrl(feedId),
      online: online
    })
  }
  return out
}

function feedForCallSign(catalog, callSign) {
  var needle = asString(callSign).toUpperCase()
  if (!needle) return null
  var list = Array.isArray(catalog) ? catalog : []
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].callSign === needle) return list[i]
  }
  return null
}

function preferLive(feeds) {
  var list = Array.isArray(feeds) ? feeds.slice() : []
  var live = []
  var unknown = []
  var offline = []
  for (var i = 0; i < list.length; i++) {
    var feed = list[i]
    if (!feed) continue
    if (feed.online === true) live.push(feed)
    else if (feed.online === false) offline.push(feed)
    else unknown.push(feed)
  }
  return live.concat(unknown, offline)
}

function statusLabel(feed) {
  if (!feed) return ""
  if (feed.online === true) return "live"
  if (feed.online === false) return "offline"
  return "unknown"
}

function overlappingFeeds(catalog, coveringCallSign, sameCodes) {
  var list = Array.isArray(catalog) ? catalog : []
  var codes = asStringList(sameCodes)
  var covering = asString(coveringCallSign).toUpperCase()
  var out = []
  var seen = {}

  function add(feed) {
    if (!feed || seen[feed.callSign]) return
    seen[feed.callSign] = true
    out.push(feed)
  }

  add(feedForCallSign(list, covering))
  if (codes.length) {
    for (var i = 0; i < list.length; i++) {
      var feed = list[i]
      if (!feed || !feed.sameCodes || !feed.sameCodes.length) continue
      for (var j = 0; j < feed.sameCodes.length; j++) {
        if (codes.indexOf(feed.sameCodes[j]) !== -1) {
          add(feed)
          break
        }
      }
    }
  }
  return preferLive(out)
}

var api = {
  listenUrl: listenUrl,
  parseCatalog: parseCatalog,
  feedForCallSign: feedForCallSign,
  overlappingFeeds: overlappingFeeds,
  preferLive: preferLive,
  statusLabel: statusLabel
}

if (typeof module !== "undefined" && module.exports) module.exports = api
