import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const py = "/usr/bin/python3"
const fetchScript = "bin/icestream-fetch.py"
const stateScript = "bin/icestream-state.py"
const playScript = "bin/icestream-play.sh"
const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function stamp(path) {
  if (!existsSync(path)) return null
  const info = statSync(path)
  return [info.ino, info.mtimeMs, info.size, info.mode]
}

function run(script, args, options) {
  const started = Date.now()
  const result = spawnSync(py, ["-I", "-S", script, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 2000,
    ...options,
  })
  result.elapsed = Date.now() - started
  return result
}

test("fetch helper rejects bad lookups without using the network", () => {
  const cases = [
    ["radio", "../evil", "5"],
    ["points", "120.0000", "0.0000", "5"],
    ["zip", "12", "5"],
    ["icecast", "extra"],
    ["wttr", "nope", "5"],
  ]
  for (const args of cases) {
    const result = run(fetchScript, args)
    assert.notEqual(result.status, 0, args.join(" "))
    assert.equal(result.stdout, "", args.join(" "))
    assert.ok(result.elapsed < 1000, args.join(" ") + " took " + result.elapsed + "ms")
  }
})

test("state helper does not touch the real settings when HOME is different", () => {
  const real = join(process.env.HOME, ".local/state/icestream/state.json")
  const before = existsSync(real) ? readFileSync(real) : null
  const fake = mkdtempSync(join(tmpdir(), "icestream-home-"))
  const env = { ...process.env, HOME: fake }
  const wrote = run(stateScript, ["write-state"], {
    env,
    input: JSON.stringify({ volume: 1, networkLocate: false, station: null }) + "\n",
  })
  assert.notEqual(wrote.status, 0)
  assert.equal(existsSync(join(fake, ".local/state/icestream/state.json")), false)
  const after = existsSync(real) ? readFileSync(real) : null
  assert.deepEqual(after, before)

  const read = run(stateScript, ["read-state"], { env })
  assert.equal(read.status, 0)
  assert.equal(read.stdout, "")
  const weather = run(stateScript, ["read-weather"], { env })
  assert.equal(weather.status, 0)
  assert.equal(weather.stdout, "")
})

test("state helper reads the manifest and bundle, and refuses a stand-in", () => {
  const manifest = run(stateScript, ["read-manifest", join(root, "manifest.json")])
  assert.equal(manifest.status, 0)
  assert.match(manifest.stdout, /"version": "0.3.7"/)

  const bundle = run(stateScript, ["read-bundle", join(root, "data/nwr-transmitters.json")])
  assert.equal(bundle.status, 0)
  assert.ok(bundle.stdout.length > 200000)
  assert.ok(bundle.stdout.length <= 512 * 1024)

  const dir = mkdtempSync(join(tmpdir(), "icestream-manifest-"))
  const link = join(dir, "manifest.json")
  symlinkSync("/etc/passwd", link)
  const linked = run(stateScript, ["read-manifest", link])
  assert.equal(linked.stdout, "")

  const huge = join(dir, "manifest.json")
  // The symlink is in the way. A second directory holds the oversized file.
  const other = mkdtempSync(join(tmpdir(), "icestream-huge-"))
  const hugePath = join(other, "manifest.json")
  writeFileSync(hugePath, "x".repeat(9000))
  const oversized = run(stateScript, ["read-manifest", hugePath])
  assert.equal(oversized.stdout, "")

  const wrong = run(stateScript, ["read-manifest", join(root, "README.md")])
  assert.notEqual(wrong.status, 0)
})

test("play script refuses a bad url before it can remove the socket", () => {
  const runtime = process.env.XDG_RUNTIME_DIR
  const uid = String(process.getuid())
  const socket = runtime + "/icestream.mpv.sock"
  const before = stamp(socket)
  const bad = spawnSync("bash", [playScript, socket, "http://127.0.0.1/x", "40"], {
    cwd: root,
    encoding: "utf8",
    timeout: 2000,
  })
  assert.equal(bad.status, 64)
  assert.match(bad.stderr, /^icestream:/)
  assert.deepEqual(stamp(socket), before)
  assert.equal(runtime, "/run/user/" + uid)

  const missing = join(tmpdir(), "icestream-not-a-socket.sock")
  const wrongSock = spawnSync("bash", [playScript, missing, "http://wxradio.org:8000/AZ-Phoenix-KEC94", "40"], {
    cwd: root,
    encoding: "utf8",
    timeout: 2000,
  })
  assert.equal(wrongSock.status, 64)
  assert.match(wrongSock.stderr, /^icestream:/)
  assert.equal(existsSync(missing), false)

  const dotted = spawnSync("bash", [playScript, socket, "http://wxradio.org:8000/../KEC94", "08"], {
    cwd: root,
    encoding: "utf8",
    timeout: 2000,
  })
  assert.equal(dotted.status, 64)
  assert.match(dotted.stderr, /^icestream:/)
  assert.deepEqual(stamp(socket), before)
})
