// Code version of this checkout. Must equal manifest.json "version"
// (tests/version.test.mjs checks).
//
// Why this exists: Omarchy's plugin hot reload does not load new QML.
// Quickshell has no Qt.clearComponentCache, so a reloaded widget comes back
// from Qt's component cache with the old code, and the keepLoaded Service is
// never replaced. After `omarchy plugin update`, everything keeps running the
// old version until `omarchy restart shell`. The running code therefore
// re-reads manifest.json from disk and compares it with its own CODE.
var CODE = "0.3.1"

function asString(value) {
  return value === undefined || value === null ? "" : String(value)
}

function isStale(serviceVersion) {
  return asString(serviceVersion) !== CODE
}

function manifestVersion(text) {
  try {
    var data = JSON.parse(asString(text) || "null")
    return data && typeof data === "object" ? asString(data.version) : ""
  } catch (e) {
    return ""
  }
}

// installedVersion: version in manifest.json on disk ("" if not read yet).
// serviceVersion: the running Service's codeVersion (null if no service;
// undefined for a pre-0.3.0 Service without one).
function restartNeeded(installedVersion, serviceVersion) {
  if (installedVersion && installedVersion !== CODE) return true
  if (serviceVersion === null) return false
  return isStale(serviceVersion)
}

var api = { CODE: CODE, isStale: isStale, manifestVersion: manifestVersion, restartNeeded: restartNeeded }

if (typeof module !== "undefined" && module.exports) module.exports = api
