// Text handed to Omarchy widgets we cannot force into plain-text mode.
// Strip the characters AutoText would treat as markup, then cap the length.
function asString(value) {
  return value === undefined || value === null ? "" : String(value)
}

function plain(value, maxLen) {
  var limit = Number(maxLen)
  if (!isFinite(limit) || limit < 1) limit = 160
  limit = Math.floor(limit)
  var text = asString(value).replace(/[<>&\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
  if (text.length > limit) text = text.slice(0, limit)
  return text
}

var api = { plain: plain }

if (typeof module !== "undefined" && module.exports) module.exports = api
