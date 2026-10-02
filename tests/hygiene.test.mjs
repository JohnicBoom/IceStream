import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

test("panel text is plain text and downloads are not buffered to the end", () => {
  const panel = readFileSync(new URL("../ui/Panel.qml", import.meta.url), "utf8")
  const texts = panel.match(/\bText \{/g) || []
  const formats = panel.match(/textFormat:\s*Text\.PlainText/g) || []
  assert.ok(texts.length >= 13)
  assert.equal(texts.length, formats.length)

  const ui = readdirSync(new URL("../ui", import.meta.url)).filter((name) => name.endsWith(".qml"))
  for (const name of ui) {
    const source = readFileSync(new URL("../ui/" + name, import.meta.url), "utf8")
    assert.equal(source.includes("StdioCollector"), false, name)
    assert.equal(source.includes("waitForEnd"), false, name)
    assert.equal(source.includes(".text()"), false, name)
  }
})

test("AGENTS.md and docs are not tracked, and the runtime helpers are not ignored", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n")
  assert.equal(tracked.includes("AGENTS.md"), false)
  assert.equal(tracked.some((name) => name === "docs" || name.startsWith("docs/")), false)
  const ignored = spawnSync("git", ["check-ignore", "-v", "bin/icestream-fetch.py", "bin/icestream-state.py"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.notEqual(ignored.status, 0)
  assert.equal(ignored.stdout, "")
})
