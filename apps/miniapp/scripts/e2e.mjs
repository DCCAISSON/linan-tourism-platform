import { createRequire } from "node:module"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const cliPath = process.env.WECHAT_DEVTOOLS_CLI

if (!cliPath) {
  console.error("E2E blocked: WECHAT_DEVTOOLS_CLI is not set; WeChat DevTools automation was not run.")
  process.exit(1)
}

if (!path.isAbsolute(cliPath) || path.extname(cliPath).toLowerCase() !== ".bat" || !fs.existsSync(cliPath)) {
  console.error("E2E blocked: WECHAT_DEVTOOLS_CLI must point to an existing absolute cli.bat path.")
  process.exit(1)
}

const require = createRequire(import.meta.url)
const automator = require("miniprogram-automator")
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectPath = path.resolve(currentDir, "../dist/dev/mp-weixin")

if (!fs.existsSync(projectPath)) {
  console.error("E2E blocked: dist/dev/mp-weixin is missing; run dev:mp-weixin before automation.")
  process.exit(1)
}

const runCli = (args, timeout) =>
  new Promise((resolve, reject) => {
    const cli = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "call", cliPath, ...args], {
      stdio: "inherit",
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      cli.kill()
      reject(new Error(`WeChat DevTools CLI timed out: ${args[0]}`))
    }, timeout)

    cli.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    cli.once("exit", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`WeChat DevTools CLI exited with code ${code}: ${args[0]}`))
    })
  })

await runCli(["auto", "--project", projectPath, "--auto-port", "9421", "--trust-project"], 45_000)

// DevTools 2.02.2608070 no longer responds to the legacy Tool.getInfo handshake
// used by miniprogram-automator 0.12.1. connectTool skips that version query
// while retaining the automator page API used below.
const miniProgram = await automator.launcher.connectTool({ wsEndpoint: "ws://127.0.0.1:9421" })

try {
  const page = await miniProgram.currentPage()
  await page.waitFor(".flow-title")
  const title = await page.$(".flow-title")
  if (!title) throw new Error("Miniapp enrollment flow title was not rendered.")
  const text = await title.text()

  if (page.path !== "pages/index/index") {
    throw new Error(`Unexpected miniapp page: ${page.path}`)
  }

  if (text !== "研学报名与支付") {
    throw new Error(`Unexpected enrollment flow title: ${text}`)
  }
} finally {
  miniProgram.disconnect()
}
