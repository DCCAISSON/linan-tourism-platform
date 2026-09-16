import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { closeServer, createFixtureServer, listen } from "./e2e-fixture.mjs"

const cliPath = process.env.WECHAT_DEVTOOLS_CLI
if (!cliPath) fail("E2E blocked: WECHAT_DEVTOOLS_CLI is not set; WeChat DevTools automation was not run.")
if (!path.isAbsolute(cliPath) || path.extname(cliPath).toLowerCase() !== ".bat" || !fs.existsSync(cliPath)) {
  fail("E2E blocked: WECHAT_DEVTOOLS_CLI must point to an existing absolute cli.bat path.")
}

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(currentDir, "..")
const projectPath = path.resolve(appDir, "dist/build/mp-weixin")
const evidenceDir = path.resolve(currentDir, "../../../.omo/evidence/task-10-linan-platform-bootstrap/miniapp-e2e")
const fixturePort = 3310
const fixtureBaseUrl = `http://127.0.0.1:${fixturePort}`
const automationEndpoint = "ws://127.0.0.1:9421"
const require = createRequire(import.meta.url)
const automator = require("miniprogram-automator")
const { fixture, server } = createFixtureServer(fixtureBaseUrl)

let miniProgram
try {
  await listen(server, fixturePort)
  fs.mkdirSync(evidenceDir, { recursive: true })
  for (const name of fs.readdirSync(evidenceDir)) if (name.endsWith(".png")) fs.unlinkSync(path.join(evidenceDir, name))
  await buildMiniapp()
  await runCli(["close", "--project", projectPath], 15_000)
  await runCli(["auto", "--project", projectPath, "--auto-port", "9421", "--trust-project"], 45_000)
  miniProgram = await connectWhenReady(60_000)
  await runJourney(miniProgram)
  console.log(JSON.stringify({ screenshots: 9, members: 2, amountFen: 25_600, status: "paid" }))
} finally {
  miniProgram?.disconnect()
  await runCli(["close", "--project", projectPath], 15_000).catch(() => undefined)
  await closeServer(server)
}

async function runJourney(program) {
  let page = await program.currentPage()
  await page.waitFor(".flow-title")
  if (page.path !== "pages/index/index") throw new Error(`miniapp page: ${page.path}`)
  assertIncludes(await (await required(page, ".state-pill__dot")).attribute("class"), "state-pill__dot--info", "loading state tone")
  await screenshot(program, "01-loading.png")
  fixture.catalogBlocked = false
  await page.waitFor(500)
  const topbar = await required(page, ".topbar")
  assertIncludes(await topbar.text(), "协议第 1 版", "friendly agreement label")
  if ((await topbar.text()).includes("family-enrollment-agreement-v1")) throw new Error("Internal agreement identifier is visible")
  assertIncludes(await (await required(page, ".state-pill__dot")).attribute("class"), "state-pill__dot--success", "ready state tone")
  await screenshot(program, "02-entry.png")

  fixture.emptyCatalog = true
  await program.reLaunch("/pages/index/index")
  page = await program.currentPage()
  await page.waitFor(300)
  let component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "暂无可报名团期", "empty catalog state")
  await screenshot(program, "03-empty.png")
  fixture.emptyCatalog = false

  fixture.failCatalog = true
  await program.reLaunch("/pages/index/index")
  page = await program.currentPage()
  await page.waitFor(300)
  component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "加载失败", "load failure state")
  assertIncludes(await (await required(page, ".state-pill__dot")).attribute("class"), "state-pill__dot--error", "error state tone")
  await screenshot(program, "04-load-error.png")
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
  await screenshot(program, "05-registration-closed.png")
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
  const inputs = await component.$$("input")
  if (inputs.length !== 7) throw new Error(`Expected 7 enrollment inputs, received ${inputs.length}`)
  const values = ["child-e2e-1", "演示学生甲", "child-e2e-2", "演示学生乙", "演示家长", "演示联系人", "13900000008"]
  for (const [index, value] of values.entries()) await inputs[index].input(value)
  await (await required(component, ".consent-button")).tap()
  await page.waitFor(100)
  await assertNoHorizontalOverflow(program, page)
  await program.pageScrollTo(10_000)
  await screenshot(program, "06-filled.png")
  await program.pageScrollTo(0)

  await (await required(page, ".primary-button")).tap()
  await page.waitFor(100)
  component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "成员：2 人", "two-participant review")
  assertIncludes(await component.text(), "演示学生甲（child-e2e-1）", "first participant review")
  assertIncludes(await component.text(), "演示学生乙（child-e2e-2）", "second participant review")
  assertIncludes(await component.text(), "紧急联系电话：13900000008", "emergency phone review")
  assertIncludes(await component.text(), "预计金额：¥256.00", "review amount")
  await program.pageScrollTo(10_000)
  await screenshot(program, "07-review.png")
  await program.pageScrollTo(0)

  await (await required(page, ".primary-button")).tap()
  await page.waitFor(300)
  component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "待支付", "pending payment state")
  assertIncludes(await component.text(), "应付金额：¥256.00", "authoritative amount")
  assertIncludes(await (await required(page, ".state-pill__dot")).attribute("class"), "state-pill__dot--warning", "pending state tone")
  const orderRequest = fixture.requests.find((entry) => entry.method === "POST" && entry.path === "/orders")
  if (orderRequest?.body.amountFen !== undefined) throw new Error("Client sent an authoritative amount")
  await screenshot(program, "08-payment-pending.png")

  fixture.orderPaid = true
  await (await required(component, ".primary-button")).tap()
  await page.waitFor(200)
  component = await required(page, "[u-i]")
  assertIncludes(await component.text(), "已支付", "paid order state")
  assertIncludes(await component.text(), "已付金额：¥256.00", "paid amount")
  assertIncludes(await (await required(page, ".state-pill__dot")).attribute("class"), "state-pill__dot--success", "paid state tone")
  await assertNoHorizontalOverflow(program, page)
  await screenshot(program, "09-paid.png")
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

async function assertNoHorizontalOverflow(program, page) {
  const size = await page.size()
  const system = await program.systemInfo()
  if (Number(size.width) > Number(system.windowWidth)) throw new Error(`Horizontal overflow: ${size.width} > ${system.windowWidth}`)
}

async function screenshot(program, name) { await program.screenshot({ path: path.join(evidenceDir, name) }) }

async function required(owner, selector) {
  const element = await owner.$(selector)
  if (element === null) throw new Error(`Required element was not rendered: ${selector}`)
  return element
}

function assertIncludes(actual, expected, label) {
  if (!actual.includes(expected)) throw new Error(`${label}: expected ${expected}`)
}


function fail(message) { console.error(message); process.exit(1) }
