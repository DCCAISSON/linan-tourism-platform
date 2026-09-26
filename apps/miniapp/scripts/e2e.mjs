import { execFileSync, spawn } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { closeServer, createFixtureServer, listen } from "./e2e-fixture.mjs"
import { runDiscoveryAfter, runDiscoveryBefore } from "./discovery-journey.mjs"
import { assertIncludes, assertNoHorizontalOverflow, evidenceDir, required, screenshot, waitForRoute } from "./e2e-ui.mjs"

const cliPath = process.env.WECHAT_DEVTOOLS_CLI
if (!cliPath) fail("E2E blocked: WECHAT_DEVTOOLS_CLI is not set; WeChat DevTools automation was not run.")
if (!path.isAbsolute(cliPath) || path.extname(cliPath).toLowerCase() !== ".bat" || !fs.existsSync(cliPath)) {
  fail("E2E blocked: WECHAT_DEVTOOLS_CLI must point to an existing absolute cli.bat path.")
}

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(currentDir, "..")
const projectPath = path.resolve(appDir, "dist/build/mp-weixin")
const fixturePort = readPort("MINIAPP_E2E_FIXTURE_PORT", 3310)
const fixtureBaseUrl = `http://127.0.0.1:${fixturePort}`
const automationPort = readPort("MINIAPP_E2E_AUTOMATION_PORT", 9421)
const automationEndpoint = `ws://127.0.0.1:${automationPort}`
const task14EvidenceRoot = path.resolve(appDir, "../../.omo/evidence/linan-remaining-business-20260922/task-14-miniapp-uat")
const task14RunId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
const task14EvidenceDir = path.join(task14EvidenceRoot, `devtools-${task14RunId}`)
const businessProductId = "business-e2e-tourism"
const require = createRequire(import.meta.url)
const automator = require("miniprogram-automator")
const { fixture, server } = createFixtureServer(fixtureBaseUrl)
const existingDevToolsProcessIds = listDevToolsProcessIds()

let miniProgram
let serverStarted = false
let projectOpened = false
try {
  await listen(server, fixturePort)
  serverStarted = true
  fs.mkdirSync(evidenceDir, { recursive: true })
  await buildMiniapp()
  await runCli(["close", "--project", projectPath], 60_000)
  await runCli(["auto", "--project", projectPath, "--auto-port", String(automationPort), "--trust-project"], 60_000)
  projectOpened = true
  miniProgram = await connectWhenReady(60_000)
  await miniProgram.callWxMethod("clearStorageSync")
  await miniProgram.mockWxMethod("login", { code: "fixture-wechat-code", errMsg: "login:ok" })
  await new Promise((resolve) => setTimeout(resolve, 5_000))
  console.log("E2E_STAGE connected")
  await withStageTimeout("discovery-before", runDiscoveryBefore(miniProgram, fixture), 90_000)
  console.log("E2E_STAGE discovery-before")
  const journeyEvidence = await withStageTimeout("baseline-journey", runJourney(miniProgram), 90_000)
  console.log("E2E_STAGE baseline-journey")
  await withStageTimeout("discovery-after", runDiscoveryAfter(miniProgram), 90_000)
  console.log("E2E_STAGE discovery-after")
  const task14Evidence = await withStageTimeout("remaining-business-surfaces", runRemainingBusinessSurfaces(miniProgram), 90_000)
  console.log(JSON.stringify({ screenshots: 24 + task14Evidence.screenshots.length, members: 2, amountFen: 25_600, paymentStateSource: "fixture-paid-state", ...journeyEvidence, task14Evidence }))
} finally {
  miniProgram?.disconnect()
  if (projectOpened) await runCli(["close", "--project", projectPath], 60_000)
  if (serverStarted) {
    fixture.catalogBlocked = false
    server.closeAllConnections()
    await closeServer(server)
  }
  await closeOwnedDevToolsProcesses(existingDevToolsProcessIds)
}

async function runRemainingBusinessSurfaces(program) {
  fs.mkdirSync(task14EvidenceDir, { recursive: true })
  const exceptions = []
  const consoleErrors = []
  const onException = (event) => exceptions.push(eventText(event))
  const onConsole = (event) => {
    if (event?.type === "error") consoleErrors.push(eventText(event))
  }
  program.on("exception", onException)
  program.on("console", onConsole)

  const screenshots = []
  const surfaces = []
  try {
    surfaces.push(await verifySurface(program, screenshots, {
      name: "pretrip",
      route: "/pages/orders/pretrip?orderId=order-e2e",
      pagePath: "pages/orders/pretrip",
      root: ".discovery-page",
      texts: ["行前服务", "集合信息", "车辆安排已过期", "张同学"],
      screenshots: ["23-pretrip.png"],
    }))
    surfaces.push(await verifySurface(program, screenshots, {
      name: "refund-application",
      route: "/pages/orders/refund?orderId=order-e2e",
      pagePath: "pages/orders/refund",
      root: ".discovery-page",
      texts: ["退款申请", "申请金额由服务器", "张同学", "申请记录", "已拒绝"],
      screenshots: ["24-refund-application.png", "25-refund-history.png"],
    }))
    surfaces.push(await verifySurface(program, screenshots, {
      name: "album",
      route: "/pages/album/index?orderId=order-e2e",
      pagePath: "pages/album/index",
      root: ".album-page",
      texts: ["活动相册", "图片直播入口", "视频直播入口", "管理员尚未发布照片或视频"],
      screenshots: ["26-album.png"],
    }))
    surfaces.push(await verifySurface(program, screenshots, {
      name: "notification-authorization",
      route: "/pages/notifications/index?orderId=order-e2e",
      pagePath: "pages/notifications/index",
      root: ".notification-page",
      texts: ["接收人授权与服务入口", "付款人不会自动成为通知接收人", "王女士", "服务入口", "已撤回记录"],
      screenshots: ["27-notifications-top.png", "28-notifications-entries.png"],
    }))
    surfaces.push(await verifyFeedbackSurface(program, screenshots))
    surfaces.push(await verifySurface(program, screenshots, {
      name: "business-products",
      route: "/pages/business/index",
      pagePath: "pages/business/index",
      root: ".business-page",
      texts: ["临安文旅服务", "旅游", "临安山水两日行", "不代表已预订、已付款或实时库存"],
      screenshots: ["30-business-products.png"],
    }))
    surfaces.push(await verifySurface(program, screenshots, {
      name: "business-product-detail",
      route: `/pages/business/detail?id=${encodeURIComponent(businessProductId)}`,
      pagePath: "pages/business/detail",
      root: ".business-detail-page",
      texts: ["临安山水两日行", "咨询需求", "不代表已付款、已预订或有房"],
      screenshots: ["31-business-detail-top.png", "32-business-detail-form.png"],
    }))
    surfaces.push(await verifySurface(program, screenshots, {
      name: "health-authorization",
      route: "/pages/health/index?orderId=order-e2e",
      pagePath: "pages/health/index",
      root: ".health-page",
      texts: ["公开摘要与健康授权", "健康原文需要单独授权", "队伍已完成集合", "提交授权", "撤回授权"],
      screenshots: ["33-health-top.png", "34-health-authorization.png"],
    }))
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (exceptions.length > 0) throw new Error(`Task 14 page exceptions: ${exceptions.join(" | ")}`)
    if (consoleErrors.length > 0) throw new Error(`Task 14 console errors: ${consoleErrors.join(" | ")}`)
  } finally {
    program.off("exception", onException)
    program.off("console", onConsole)
  }

  const report = {
    runId: task14RunId,
    fixtureBaseUrl,
    automationPort,
    fictionalFixture: true,
    externalWrites: false,
    surfaces,
    screenshots,
    exceptions,
    consoleErrors,
  }
  fs.writeFileSync(path.join(task14EvidenceDir, "result.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

async function verifySurface(program, screenshots, spec) {
  console.log(`E2E_STAGE task14-${spec.name}`)
  await program.reLaunch(spec.route)
  const page = await waitForRoute(program, spec.pagePath)
  const text = await waitForPageText(page, spec.root, spec.texts)
  await assertNoHorizontalOverflow(program, page)
  await program.pageScrollTo(0)
  await task14Screenshot(program, screenshots, spec.screenshots[0])
  if (spec.screenshots[1]) {
    await program.pageScrollTo(10_000)
    await new Promise((resolve) => setTimeout(resolve, 100))
    await task14Screenshot(program, screenshots, spec.screenshots[1])
    await program.pageScrollTo(0)
  }
  return { name: spec.name, route: spec.pagePath, visible: spec.texts, horizontalOverflow: false, textLength: text.length }
}

async function verifyFeedbackSurface(program, screenshots) {
  console.log("E2E_STAGE task14-service-feedback")
  const route = "/pages/feedback/index?tourSessionId=session-open-e2e&orderId=order-e2e"
  await program.reLaunch(route)
  const page = await waitForRoute(program, "pages/feedback/index")
  const text = await waitForPageText(page, ".feedback-page", ["服务反馈", "不影响学生评价等级", "允许审核后公开摘要", "提交反馈"])
  const component = await required(page, ".feedback-page")
  const inputs = await component.$$("input")
  const textareas = await component.$$("textarea")
  if (inputs.length < 2 || textareas.length < 1) throw new Error("Feedback form controls were not rendered")
  await inputs[0].input("赵女士")
  await textareas[0].input("希望集合提醒更清楚。")
  await assertNoHorizontalOverflow(program, page)
  await task14Screenshot(program, screenshots, "29-service-feedback.png")
  return { name: "service-feedback", route: "pages/feedback/index", visible: ["服务反馈", "允许审核后公开摘要", "提交反馈"], horizontalOverflow: false, textLength: text.length, submitted: false }
}

async function waitForPageText(page, rootSelector, expectedTexts) {
  const deadline = Date.now() + 5_000
  let lastText = ""
  while (Date.now() < deadline) {
    const component = await page.$(rootSelector)
    if (component !== null) {
      lastText = await component.text()
      if (expectedTexts.every((expected) => lastText.includes(expected))) return lastText
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const missing = expectedTexts.filter((expected) => !lastText.includes(expected))
  throw new Error(`Page text missing: ${missing.join(", ")}; received ${lastText}`)
}

async function task14Screenshot(program, screenshots, name) {
  fs.mkdirSync(task14EvidenceDir, { recursive: true })
  const screenshotPath = path.join(task14EvidenceDir, name)
  if (process.env.MINIAPP_E2E_SKIP_SCREENSHOTS === "1") {
    const skippedPath = `${screenshotPath}.skipped.txt`
    fs.writeFileSync(skippedPath, "DevTools screenshot protocol blocked in this environment; screenshot skipped for bounded automation probe.\n", "utf8")
    screenshots.push(skippedPath)
    return
  }
  await program.screenshot({ path: screenshotPath })
  screenshots.push(screenshotPath)
}

function eventText(event) {
  try { return JSON.stringify(event) }
  catch { return String(event) }
}

async function runJourney(program) {
  await withStageTimeout("journey-relaunch-enrollment", program.reLaunch("/pages/enrollment/index"), 15_000)
  let page = await withStageTimeout("journey-current-page", program.currentPage(), 15_000)
  await withStageTimeout("journey-wait-flow-title", page.waitFor(".flow-title"), 15_000)
  if (page.path !== "pages/enrollment/index") throw new Error(`miniapp page: ${page.path}`)
  await withStageTimeout("journey-screenshot-signup", screenshot(program, "10-signup.png"), 15_000)
  fixture.catalogBlocked = false
  await page.waitFor(500)
  const topbar = await required(page, ".topbar")
  assertIncludes(await topbar.text(), "可填写", "ready enrollment state")
  if ((await topbar.text()).includes("family-enrollment-agreement-v1")) throw new Error("Internal agreement identifier is visible")
  assertIncludes(await (await required(page, ".state-pill__dot")).attribute("class"), "state-pill__dot--success", "ready state tone")
  await screenshot(program, "11-signup-entry.png")

  fixture.emptyCatalog = true
  await program.reLaunch("/pages/enrollment/index")
  page = await program.currentPage()
  await page.waitFor(300)
  let component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "暂无可报名团期", "empty catalog state")
  await screenshot(program, "12-signup-empty.png")
  fixture.emptyCatalog = false

  fixture.failCatalog = true
  await program.reLaunch("/pages/enrollment/index")
  page = await program.currentPage()
  await page.waitFor(300)
  component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "加载失败", "load failure state")
  assertIncludes(await (await required(page, ".state-pill__dot")).attribute("class"), "state-pill__dot--error", "error state tone")
  await screenshot(program, "13-signup-error.png")
  fixture.failCatalog = false
  await (await required(component, ".secondary-button")).tap()
  await page.waitFor(300)

  component = await required(page, "[u-i]")
  let pickers = await component.$$("picker")
  await pickers[0].trigger("change", { value: 0 })
  await page.waitFor(150)
  component = await required(page, "[u-i]")
  pickers = await component.$$("picker")
  await pickers[1].trigger("change", { value: 0 })
  await page.waitFor(150)
  component = await required(page, "[u-i]")
  pickers = await component.$$("picker")
  await pickers[2].trigger("change", { value: 0 })
  await pickers[3].trigger("change", { value: 1 })
  await page.waitFor(100)
  await (await required(page, ".primary-button")).tap()
  await page.waitFor(".readiness-line")
  assertIncludes(await (await required(page, ".readiness-line")).text(), "报名已关闭", "closed registration state")
  await program.pageScrollTo(10_000)
  await screenshot(program, "14-registration-closed.png")
  await program.pageScrollTo(0)

  component = await required(page, "[u-i]")
  pickers = await component.$$("picker")
  await pickers[3].trigger("change", { value: 0 })
  await page.waitFor(100)
  assertIncludes(await (await required(page, ".topbar")).text(), "告知书 v1", "active notice version")
  component = await required(page, "[u-i]")
  await (await required(component, ".text-button")).tap()
  await page.waitFor(50)
  component = await required(page, "[u-i]")
  await (await required(component, ".text-button")).tap()
  await page.waitFor(50)
  component = await required(page, "[u-i]")
  const kindButtons = await component.$$(".kind-toggle__button")
  if (kindButtons.length !== 4) throw new Error(`Expected 4 participant kind buttons, received ${kindButtons.length}`)
  await kindButtons[3].tap()
  await page.waitFor(50)
  component = await required(page, "[u-i]")
  const inputs = await component.$$("input")
  if (inputs.length !== 7) throw new Error(`Expected 7 enrollment inputs, received ${inputs.length}`)
  const emergencyPhone = virtualPhone(8)
  const values = [
    "\u5f20\u540c\u5b66",
    virtualResidentId(1),
    "\u674e\u5973\u58eb",
    virtualResidentId(2),
    virtualPhone(2),
    "\u738b\u5973\u58eb",
    emergencyPhone,
  ]
  for (const [index, value] of values.entries()) await inputs[index].input(value)
  assertIncludes(await component.text(), "证件号码", "identity label")
  assertIncludes(await component.text(), "家长手机", "parent phone label")
  assertIncludes(await component.text(), "家长联系人", "contact label")
  await program.pageScrollTo(900)
  await screenshot(program, "15-adult-member.png")
  await program.pageScrollTo(0)
  for (const choice of await component.$$(".save-common-button")) await choice.tap()
  await (await required(component, ".enrollment-agreement-button")).tap()
  await page.waitFor(100)
  await assertNoHorizontalOverflow(program, page)
  await program.pageScrollTo(10_000)
  await screenshot(program, "15-filled.png")
  await program.pageScrollTo(0)

  await (await required(page, ".primary-button")).tap()
  await page.waitFor(100)
  component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "\u53c2\u4e0e\u4eba\u6570\uff1a2 \u4eba", "two-participant review")
  assertIncludes(await component.text(), "\u6210\u5458 1\uff1a\u5f20\u540c\u5b66", "first participant review")
  assertIncludes(await component.text(), "\u6210\u5458 2\uff1a\u674e\u5973\u58eb", "second participant review")
  assertIncludes(await component.text(), "成人 · 无需年级班级", "adult review placement")
  assertIncludes(await component.text(), `紧急联系电话：${emergencyPhone}`, "emergency phone review")
  assertIncludes(await component.text(), "预计金额：¥256.00", "review amount")
  await program.pageScrollTo(10_000)
  await screenshot(program, "16-review.png")
  await program.pageScrollTo(0)

  await (await required(page, ".primary-button")).tap()
  await page.waitFor(300)
  component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "待支付", "pending payment state")
  assertIncludes(await component.text(), "应付金额：¥256.00", "authoritative amount")
  assertIncludes(await (await required(page, ".state-pill__dot")).attribute("class"), "state-pill__dot--warning", "pending state tone")
  const adultMemberRequest = fixture.requests.find((entry) => entry.method === "POST" && entry.path === "/enrollment/members" && entry.body.participantKind === "adult")
  if (!adultMemberRequest) throw new Error("Adult member payload was not submitted")
  if ("gradeId" in adultMemberRequest.body || "classId" in adultMemberRequest.body) throw new Error("Adult member payload must not include gradeId or classId")
  if (adultMemberRequest.body.tourSessionId !== "session-open-e2e") throw new Error("Adult member payload must include the selected tourSessionId")
  const orderRequest = fixture.requests.find((entry) => entry.method === "POST" && entry.path === "/orders")
  if (orderRequest?.body.amountFen !== undefined) throw new Error("Client sent an authoritative amount")
  await screenshot(program, "17-payment-pending.png")

  fixture.orderPaid = true
  await (await required(component, ".primary-button")).tap()
  await page.waitFor(200)
  component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "已支付", "paid order state")
  assertIncludes(await component.text(), "已付金额：¥256.00", "paid amount")
  assertIncludes(await (await required(page, ".state-pill__dot")).attribute("class"), "state-pill__dot--success", "paid state tone")
  await assertNoHorizontalOverflow(program, page)
  await screenshot(program, "18-paid.png")
  return { adultPayloadNoGradeClass: true, adultPayloadTourSessionId: "session-open-e2e" }
}

async function buildMiniapp() {
  const env = { ...process.env, VITE_API_BASE_URL: fixtureBaseUrl, VITE_DEV_FAMILY_IDENTITY_HEADER: "", VITE_WECHAT_LOGIN_ENABLED: "true" }
  if (process.platform === "win32") {
    await runProcess(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "corepack pnpm build:mp-weixin"], 300_000, env)
    return
  }
  await runProcess("corepack", ["pnpm", "build:mp-weixin"], 300_000, env)
}

async function runCli(args, timeout) {
  await runProcess(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "call", cliPath, ...args], timeout, process.env)
}

function runProcess(command, args, timeout, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: appDir, env, stdio: "inherit", windowsHide: true })
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Command timed out: ${args[0]}`)) }, timeout)
    child.once("error", (error) => { clearTimeout(timer); reject(error) })
    child.once("exit", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`Command exited with code ${code}: ${args[0]}`))
    })
  })
}

async function connectWhenReady(timeout) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    let candidate
    try {
      candidate = await automator.launcher.connectTool({ wsEndpoint: automationEndpoint })
      await candidate.currentPage()
      return candidate
    } catch (error) {
      candidate?.disconnect()
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw lastError ?? new Error(`WeChat DevTools automation was not ready at ${automationEndpoint}.`)
}

function withStageTimeout(stage, promise, timeoutMs) {
  let timer
  return Promise.race([
    promise.finally(() => { clearTimeout(timer) }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`E2E stage timed out after ${timeoutMs}ms: ${stage}`)), timeoutMs)
    }),
  ])
}

function fail(message) { console.error(message); process.exit(1) }

function readPort(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isInteger(value) || value < 1024 || value > 65_535) fail(`${name} must be an integer port between 1024 and 65535.`)
  return value
}

function listDevToolsProcessIds() {
  if (process.platform !== "win32") return new Set()
  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "(Get-Process -Name '微信开发者工具' -ErrorAction SilentlyContinue | Where-Object { -not $_.HasExited }).Id",
    ], { encoding: "utf8", windowsHide: true })
    return new Set(output.split(/\s+/u).map(Number).filter(Number.isSafeInteger))
  } catch {
    return new Set()
  }
}

async function closeOwnedDevToolsProcesses(existingProcessIds) {
  if (process.platform !== "win32") return
  const ownedProcessIds = [...listDevToolsProcessIds()].filter((processId) => !existingProcessIds.has(processId))
  for (const processId of ownedProcessIds) {
    try { await runProcess("taskkill.exe", ["/PID", String(processId), "/T", "/F"], 15_000, process.env) }
    catch {}
  }
}

function virtualPhone(seed) {
  return `1990000${String(seed).padStart(4, "0")}`
}

function virtualResidentId(seed) {
  const day = String(seed).padStart(2, "0")
  const sequence = String(seed).padStart(3, "0")
  const body = `110101201601${day}${sequence}`
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checkDigits = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"]
  let sum = 0
  for (const [index, digit] of [...body].entries()) sum += Number(digit) * weights[index]
  return `${body}${checkDigits[sum % 11]}`
}
