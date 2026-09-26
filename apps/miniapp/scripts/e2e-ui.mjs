import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
export const evidenceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.omo/evidence/linan-first-working-20260917/miniapp/devtools")
export async function screenshot(program, name) {
  fs.mkdirSync(evidenceDir, { recursive: true })
  const screenshotPath = path.join(evidenceDir, name)
  if (process.env.MINIAPP_E2E_SKIP_SCREENSHOTS === "1") {
    fs.writeFileSync(`${screenshotPath}.skipped.txt`, "DevTools screenshot protocol blocked in this environment; screenshot skipped for bounded automation probe.\n", "utf8")
    return
  }
  await program.screenshot({ path: screenshotPath })
}
export async function required(owner, selector) {
  const element = await owner.$(selector)
  if (element === null) throw new Error(`Required element was not rendered: ${selector}`)
  return element
}
export function assertIncludes(actual, expected, label) {
  if (!actual.includes(expected)) throw new Error(`${label}: expected ${expected}; received ${actual}`)
}
export async function componentWithText(page, text) {
  const components = await page.$$("[u-i]")
  for (const component of components) if ((await component.text()).includes(text)) return component
  throw new Error(`Component with text was not rendered: ${text}`)
}
export async function waitForRoute(program, route) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const page = await program.currentPage()
    if (page.path === route) return page
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Navigation did not reach ${route}`)
}
export async function assertNoHorizontalOverflow(program, page) {
  const size = await page.size()
  const system = await program.systemInfo()
  if (Number(size.width) > Number(system.windowWidth)) throw new Error(`Horizontal overflow: ${size.width} > ${system.windowWidth}`)
}
