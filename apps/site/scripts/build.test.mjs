import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import test from "node:test"

test("public site build completes without a recursive copy crash", () => {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "build.mjs")], { encoding: "utf8" })
  assert.equal(result.status, 0, `build failed\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
})
