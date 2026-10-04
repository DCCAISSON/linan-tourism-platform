import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import {
  collectFormalSurfaceCopyViolations,
  formatFormalSurfaceCopyViolations,
} from "./release-gate.mjs"

const releaseGatePath = fileURLToPath(new URL("./release-gate.mjs", import.meta.url))

test("formal-surface-copy reports user-visible page copy with file, line and term", () => {
  const root = makeFixture()
  try {
    writeFileSync(
      join(root, "apps", "miniapp", "src", "pages", "index.vue"),
      [
        "<template>",
        "  <view>",
        "    <text>当前为体验版，请使用测试资料。</text>",
        "  </view>",
        "</template>",
      ].join("\n"),
    )

    const findings = collectFormalSurfaceCopyViolations(root)
    assert.deepEqual(findings.map((finding) => [finding.file, finding.line, finding.term]), [
      ["apps/miniapp/src/pages/index.vue", 3, "体验版"],
      ["apps/miniapp/src/pages/index.vue", 3, "测试"],
    ])
    assert.match(formatFormalSurfaceCopyViolations(findings), /apps\/miniapp\/src\/pages\/index\.vue:3: 体验版/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("formal-surface-copy ignores tests, scripts, docs, private files and API internals", () => {
  const root = makeFixture()
  try {
    writeFileSync(
      join(root, "apps", "miniapp", "src", "tests", "fixture.vue"),
      "<template><text>体验版 测试 演示 模拟 虚构</text></template>",
    )
    writeFileSync(
      join(root, "apps", "miniapp", "src", "scripts", "fixture.vue"),
      "<template><text>体验版 测试 演示 模拟 虚构</text></template>",
    )
    writeFileSync(join(root, "docs", "copy.html"), "<p>体验版</p>")
    writeFileSync(join(root, "private", "copy.html"), "<p>体验版</p>")
    writeFileSync(
      join(root, "apps", "api", "src", "modules", "internal.vue"),
      "<template><text>体验版</text></template>",
    )
    writeFileSync(
      join(root, "apps", "site", "src", "index.html"),
      "<main><p>临安旅游集散中心研学服务</p></main>",
    )

    assert.deepEqual(collectFormalSurfaceCopyViolations(root), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("formal-surface-copy scans explicit Chinese strings used by Vue pages", () => {
  const root = makeFixture()
  try {
    writeFileSync(
      join(root, "apps", "admin", "src", "views", "HomeView.vue"),
      [
        "<template><p>{{ caption }}</p></template>",
        "<script setup>",
        "const caption = \"本地模拟结果\"",
        "const className = \"test-notice\"",
        "</script>",
      ].join("\n"),
    )

    const findings = collectFormalSurfaceCopyViolations(root)
    assert.deepEqual(findings.map((finding) => [finding.line, finding.term, finding.text]), [
      [3, "本地模拟", "本地模拟结果"],
      [3, "模拟", "本地模拟结果"],
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("unknown explicit release-gate check is rejected when no injection is provided", () => {
  const result = spawnSync(process.execPath, [releaseGatePath, "no-such-check"], { encoding: "utf8" })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Unknown release-gate check: no-such-check/)
})

test("package-manager scenario argument selects the formal surface check", () => {
  const result = spawnSync(
    process.execPath,
    [releaseGatePath, "--", "--scenario", "formal-surface-copy"],
    { encoding: "utf8" },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Release gate ready: no blocker/)
})

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "linan-release-gate-"))
  for (const dir of [
    ["apps", "miniapp", "src", "pages"],
    ["apps", "miniapp", "src", "tests"],
    ["apps", "miniapp", "src", "scripts"],
    ["apps", "admin", "src", "views"],
    ["apps", "site", "src"],
    ["apps", "api", "src", "modules"],
    ["docs"],
    ["private"],
  ]) {
    mkdirSync(join(root, ...dir), { recursive: true })
  }
  return root
}
