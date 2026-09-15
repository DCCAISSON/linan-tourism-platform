import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const cliPath = process.env.WECHAT_DEVTOOLS_CLI

if (!cliPath) {
  console.error("E2E blocked: WECHAT_DEVTOOLS_CLI is not set; WeChat DevTools automation was not run.")
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

const miniProgram = await automator.launch({
  cliPath,
  projectPath,
})

try {
  const page = await miniProgram.reLaunch("/pages/index/index")
  await page.waitFor(500)
  const status = await page.$(".status__text")
  const text = await status.text()

  if (text !== "骨架已就绪") {
    throw new Error(`Unexpected health status: ${text}`)
  }
} finally {
  await miniProgram.close()
}
