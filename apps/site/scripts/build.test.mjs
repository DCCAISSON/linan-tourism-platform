import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

test("public site build completes without a recursive copy crash", () => {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "build.mjs")], { encoding: "utf8" })
  assert.equal(result.status, 0, `build failed\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
})

test("public site presents formal external copy", () => {
  const html = readFileSync(resolve(import.meta.dirname, "..", "src", "index.html"), "utf8")
  assert.match(html, /临安旅游通/)
  assert.match(html, /ICP备案号将在运营方提供正式编号后展示/)
  assert.match(html, /公安联网备案完成后同步展示/)
  for (const forbidden of ["体验版", "测试", "测试名单", "演示", "模拟", "虚构", "待开发", "内推", "开发版"]) {
    assert.equal(html.includes(forbidden), false, `found internal wording: ${forbidden}`)
  }
})
