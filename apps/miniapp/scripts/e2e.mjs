import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { closeServer, createFixtureServer, listen } from "./e2e-fixture.mjs"
import { runDiscoveryAfter, runDiscoveryBefore } from "./discovery-journey.mjs"
import { assertIncludes, assertNoHorizontalOverflow, evidenceDir, required, screenshot } from "./e2e-ui.mjs"

const cliPath = process.env.WECHAT_DEVTOOLS_CLI
if (!cliPath) fail("E2E blocked: WECHAT_DEVTOOLS_CLI is not set; WeChat DevTools automation was not run.")
if (!path.isAbsolute(cliPath) || path.extname(cliPath).toLowerCase() !== ".bat" || !fs.existsSync(cliPath)) {
  fail("E2E blocked: WECHAT_DEVTOOLS_CLI must point to an existing absolute cli.bat path.")
}

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(currentDir, "..")
const projectPath = path.resolve(appDir, "dist/build/mp-weixin")
const fixturePort = 3310
const fixtureBaseUrl = `http://127.0.0.1:${fixturePort}`
const automationEndpoint = "ws://127.0.0.1:9421"
const require = createRequire(import.meta.url)
const automator = require("miniprogram-automator")
const { fixture, server } = createFixtureServer(fixtureBaseUrl)

let miniProgram
let serverStarted = false
let projectOpened = false
try {
  await listen(server, fixturePort)
  serverStarted = true
  fs.mkdirSync(evidenceDir, { recursive: true })
  await buildMiniapp()
  await runCli(["close", "--project", projectPath], 15_000)
  await runCli(["auto", "--project", projectPath, "--auto-port", "9421", "--trust-project"], 45_000)
  projectOpened = true
  miniProgram = await connectWhenReady(60_000)
  await runDiscoveryBefore(miniProgram, fixture)
  const journeyEvidence = await runJourney(miniProgram)
  await runDiscoveryAfter(miniProgram)
  console.log(JSON.stringify({ screenshots: 23, members: 2, amountFen: 25_600, status: "paid", localMock: true, ...journeyEvidence }))
} finally {
  miniProgram?.disconnect()
  if (projectOpened) await runCli(["close", "--project", projectPath], 15_000)
  if (serverStarted) {
    fixture.catalogBlocked = false
    server.closeAllConnections()
    await closeServer(server)
  }
}

async function runJourney(program) {
  await program.reLaunch("/pages/enrollment/index")
  let page = await program.currentPage()
  await page.waitFor(".flow-title")
  if (page.path !== "pages/enrollment/index") throw new Error(`miniapp page: ${page.path}`)
  await screenshot(program, "10-signup.png")
  fixture.catalogBlocked = false
  await page.waitFor(500)
  const topbar = await required(page, ".topbar")
  assertIncludes(await topbar.text(), "协议第 1 版", "friendly agreement label")
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
  assertIncludes(await (await required(page, ".readiness-line")).text(), "报名已关闭", "closed registration state")
  await program.pageScrollTo(10_000)
  await screenshot(program, "14-registration-closed.png")
  await program.pageScrollTo(0)

  component = await required(page, "[u-i]")
  pickers = await component.$$("picker")
  await pickers[3].trigger("change", { value: 0 })
  await page.waitFor(100)
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
  if (inputs.length !== 11) throw new Error(`Expected 11 enrollment inputs, received ${inputs.length}`)
  const emergencyPhone = virtualPhone(8)
  const values = [
    "child-e2e-1",
    "演示学生甲",
    virtualResidentId(1),
    virtualPhone(1),
    "child-e2e-2",
    "演示成人乙",
    virtualResidentId(2),
    virtualPhone(2),
    "演示家长",
    "演示联系人",
    emergencyPhone,
  ]
  for (const [index, value] of values.entries()) await inputs[index].input(value)
  assertIncludes(await component.text(), "成员编号", "member code label")
  assertIncludes(await component.text(), "证件号码", "identity label")
  assertIncludes(await component.text(), "联系电话", "member phone label")
  assertIncludes(await component.text(), "家长联系人", "contact label")
  await program.pageScrollTo(900)
  await screenshot(program, "15-adult-member.png")
  await program.pageScrollTo(0)
  await (await required(component, ".consent-button")).tap()
  await page.waitFor(100)
  await assertNoHorizontalOverflow(program, page)
  await program.pageScrollTo(10_000)
  await screenshot(program, "15-filled.png")
  await program.pageScrollTo(0)

  await (await required(page, ".primary-button")).tap()
  await page.waitFor(100)
  component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "成员：2 人", "two-participant review")
  assertIncludes(await component.text(), "演示学生甲（child-e2e-1）", "first participant review")
  assertIncludes(await component.text(), "演示成人乙（child-e2e-2）", "second participant review")
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
  const env = { ...process.env, VITE_API_BASE_URL: fixtureBaseUrl, VITE_DEV_FAMILY_IDENTITY_HEADER: "family-e2e" }
  if (process.platform === "win32") {
    await runProcess(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "corepack pnpm build:mp-weixin"], 120_000, env)
    return
  }
  await runProcess("corepack", ["pnpm", "build:mp-weixin"], 120_000, env)
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

function fail(message) { console.error(message); process.exit(1) }

function virtualPhone(seed) {
  return `1990000${String(seed).padStart(4, "0")}`
}

function virtualResidentId(seed) {
  const body = `999999201601${String(seed).padStart(2, "0")}00`
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checkDigits = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"]
  let sum = 0
  for (const [index, digit] of [...body].entries()) sum += Number(digit) * weights[index]
  return `${body}${checkDigits[sum % 11]}`
}
