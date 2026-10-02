import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { test } from "node:test"

const require = createRequire(import.meta.url)
const text = require("../lib/text.js")

test("plain strips markup characters and caps the length", () => {
  assert.equal(text.plain("KWO39 <img src=x> & Chicago"), "KWO39 img src=x  Chicago")
  assert.equal(text.plain("abc", 2), "ab")
  assert.equal(text.plain(null), "")
  assert.equal(text.plain("a\u0000b\u202ec"), "abc")
})
