import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import { parseCatalogItem, parseTourSession } from "../src/api/configuration.parsers"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"
const evidence = fileURLToPath(new URL("../../../.omo/evidence/catalog-selfservice-20261007/browser/", import.meta.url))
test.use({ locale: "zh-CN", timezoneId: "America/Los_Angeles" })

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: "disabled" })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()?.width)
}

for (const width of [375, 768, 1280]) {
  test(`self-service catalog and session edits at ${width}px`, async ({ page }) => {
    await mkdir(evidence, { recursive: true })
    await page.setViewportSize({ width, height: 900 })
    await page.clock.setFixedTime(new Date("2026-10-07T02:00:00.000Z"))
    const errors: string[] = []
    const unexpected: string[] = []
    const patches: { path: string; payload: unknown }[] = []
    page.on("pageerror", error => errors.push(error.message))
    let rejectSave = false
    let item = parseCatalogItem({
      id: "catalog-1", organizationId: "school-1", code: "nature-1", title: "天目山自然观察",
      status: "active", description: "走进山林，观察植物与昆虫，记录秋天的自然变化。",
      coverImageUrl: "", templateId: null, policyVersion: "2026-01",
    })
    const shared = { ...item, id: "catalog-shared", code: "shared-1", title: "多校共享自然课程", templateId: "template-1" }
    let session = parseTourSession({
      id: "session-1", organizationId: "school-1", catalogItemId: "catalog-1", code: "自然观察秋季团",
      startsAt: "2026-11-12T00:00:37.000Z", endsAt: "2026-11-12T10:00:43.000Z",
      enrollmentOpensAt: "2026-10-01T01:15:27.000Z", enrollmentClosesAt: "2026-10-30T10:00:39.000Z",
      status: "published", priceFen: 12800, capacity: 30, occupiedCapacity: 12, minimumParticipants: 10,
      enrollmentScope: null, activeNoticeId: null, activeNotice: null, policyVersion: "2026-01",
    })
    await page.route("**/*", async route => {
      const url = new URL(route.request().url())
      if (url.hostname === "127.0.0.1" && url.port !== "3000") return route.continue()
      unexpected.push(route.request().url())
      await route.abort()
    })
    await page.route(`${apiBase}/**`, async route => {
      const path = new URL(route.request().url()).pathname
      if (route.request().method() === "GET") {
        if (path === "/schools") return route.fulfill({ json: [{ id: "school-1", name: "本地测试小学", code: "QA001" }] })
        if (path === "/catalog-items") return route.fulfill({ json: [item, shared] })
        if (path === "/tour-sessions") return route.fulfill({ json: [session] })
        if (path === "/catalog-templates") return route.fulfill({ json: [{ id: "template-1", title: shared.title, description: shared.description, coverImageUrl: "", version: 1 }] })
        if (/\/(grades|classes|notices)$/u.test(path)) return route.fulfill({ json: [] })
      }
      if (route.request().method() === "PATCH" && ["/catalog-items/catalog-1", "/tour-sessions/session-1"].includes(path)) {
        const payload: unknown = route.request().postDataJSON()
        patches.push({ path, payload })
        if (rejectSave) return route.fulfill({ status: 503, json: { message: "保存服务暂不可用，请稍后重试" } })
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("PATCH body must be an object")
        if (path === "/catalog-items/catalog-1") {
          item = parseCatalogItem({ ...item, ...payload })
          return route.fulfill({ json: item })
        }
        session = parseTourSession({ ...session, ...payload })
        return route.fulfill({ json: session })
      }
      unexpected.push(`${route.request().method()} ${path}`)
      return route.fulfill({ status: 404, json: { message: "未定义的本地测试请求" } })
    })
    await installStaffAuthMock(page)
    await page.goto("/configuration")
    const catalog = page.getByRole("region", { name: "课程", exact: true })
    const sessions = page.getByRole("region", { name: "团期", exact: true })
    const catalogRow = catalog.locator(":scope > .record-list > li").first()
    const sessionRow = sessions.locator(":scope > .record-list > li").first()
    const catalogForm = page.locator("#catalog-edit").locator("xpath=ancestor::form")
    const sessionForm = page.locator("#session-edit").locator("xpath=ancestor::form")
    await expect(page.getByRole("heading", { name: "学校、课程与团期配置" })).toBeVisible()
    await page.getByLabel("编辑课程内容").selectOption("catalog-1")
    await page.getByLabel("修改课程名称").fill("天目山秋日自然观察")
    await page.getByLabel("修改课程状态").selectOption("disabled")
    await page.getByRole("button", { name: "保存课程内容", exact: true }).click()
    await expect(catalogRow.locator(":scope > strong")).toHaveText("天目山秋日自然观察")
    await expect(catalogRow.locator(":scope > span").filter({ hasText: /^停用$/u })).toBeVisible()
    expect(patches.at(-1)?.payload).toMatchObject({ title: "天目山秋日自然观察", status: "disabled" })
    await catalogForm.evaluate(element => element.scrollIntoView({ block: "start" }))
    await capture(page, `catalog-disabled-${width}`)
    await page.getByLabel("修改课程状态").selectOption("active")
    await page.getByRole("button", { name: "保存课程内容", exact: true }).click()
    await expect(catalogRow.locator(":scope > span").filter({ hasText: /^启用$/u })).toBeVisible()
    expect(patches.at(-1)?.payload).toMatchObject({ title: "天目山秋日自然观察", status: "active" })
    rejectSave = true
    await page.getByLabel("修改课程名称").fill("这次名称保存失败")
    await page.getByRole("button", { name: "保存课程内容", exact: true }).click()
    await expect(catalog.getByRole("alert")).toHaveText("保存服务暂不可用，请稍后重试")
    await expect(catalog.getByRole("status")).toHaveCount(0)
    await expect(catalogRow.locator(":scope > strong")).toHaveText("天目山秋日自然观察")
    await catalog.getByRole("alert").evaluate(element => element.scrollIntoView({ block: "center" }))
    await capture(page, `catalog-save-error-${width}`)
    rejectSave = false
    await page.getByLabel("编辑课程内容").selectOption("catalog-shared")
    for (const label of ["修改课程名称", "修改课程状态", "修改课程介绍"]) await expect(page.getByLabel(label, { exact: true })).toBeDisabled()
    await expect(page.getByRole("button", { name: "保存课程内容", exact: true })).toBeDisabled()
    await expect(catalog.getByText("该课程使用共享模板，请在上方编辑模板；如需单校修改，可先解除关联。")).toBeVisible()
    await catalogForm.evaluate(element => element.scrollIntoView({ block: "start" }))
    await capture(page, `shared-template-boundary-${width}`)

    await page.getByLabel("编辑团期", { exact: true }).selectOption("session-1")
    await expect(page.getByLabel("修改报名开始", { exact: true })).toHaveValue("2026-10-01T09:15")
    await expect(page.getByLabel("修改报名截止", { exact: true })).toHaveValue("2026-10-30T18:00")
    await page.getByLabel("修改容量", { exact: true }).fill("40")
    await page.getByRole("button", { name: "保存团期修改", exact: true }).click()
    await expect(sessionRow.locator(":scope > span").filter({ hasText: /^40 人$/u })).toBeVisible()
    expect(patches.at(-1)?.payload).toMatchObject({
      capacity: 40, startsAt: "2026-11-12T00:00:37.000Z", endsAt: "2026-11-12T10:00:43.000Z",
      enrollmentOpensAt: "2026-10-01T01:15:27.000Z", enrollmentClosesAt: "2026-10-30T10:00:39.000Z",
    })
    await page.getByLabel("修改容量", { exact: true }).fill("20")
    await page.getByRole("button", { name: "保存团期修改", exact: true }).click()
    await expect(sessionRow.locator(":scope > span").filter({ hasText: /^20 人$/u })).toBeVisible()
    const patchCount = patches.length
    await page.getByLabel("修改容量", { exact: true }).fill("11")
    await page.getByRole("button", { name: "保存团期修改", exact: true }).click()
    await expect(sessionForm.getByText("容量不能少于已付款有效人数 12 人", { exact: true })).toBeVisible()
    await expect(sessions.getByRole("status")).toHaveCount(0)
    expect(patches).toHaveLength(patchCount)
    await sessionForm.locator(".form-error").evaluate(element => element.scrollIntoView({ block: "center" }))
    await capture(page, `capacity-error-${width}`)
    await page.getByLabel("修改容量", { exact: true }).fill("12")
    await page.getByLabel("修改报名截止", { exact: true }).fill("2026-10-30T20:30")
    await page.getByRole("button", { name: "保存团期修改", exact: true }).click()
    await expect(sessionRow.locator(":scope > span").filter({ hasText: /^12 人$/u })).toBeVisible()
    expect(patches.at(-1)?.payload).toMatchObject({ capacity: 12, enrollmentClosesAt: "2026-10-30T12:30:00.000Z" })
    await expect(sessionRow.locator(":scope > span").filter({ hasText: /^报名：/u })).toContainText("2026-10-30 20:30（北京时间）")
    await sessions.getByRole("link", { name: "查看该团期已保存内容" }).click()
    await expect(page.locator("#session-saved-session-1")).toContainText("2026-10-30 20:30")
    await capture(page, `saved-minute-preview-${width}`)
    await page.reload()
    await expect(page.getByLabel("修改报名截止", { exact: true })).toHaveValue("2026-10-30T20:30")
    await expect(page.getByLabel("修改容量", { exact: true })).toHaveValue("12")
    await page.getByLabel("编辑课程内容").selectOption("catalog-1")
    await expect(page.getByLabel("修改课程名称")).toHaveValue("天目山秋日自然观察")
    await expect(page.getByLabel("修改课程状态")).toHaveValue("active")
    await page.getByLabel("修改报名截止", { exact: true }).focus()
    await page.locator("#session-edit-open").locator("..").evaluate(element => element.scrollIntoView({ block: "start" }))
    await capture(page, `beijing-datetime-focused-${width}`)
    const dateGeometry = await page.locator("#session-edit-close").evaluate(element => {
      const box = element.getBoundingClientRect()
      return { left: box.left, right: box.right, width: box.width, type: element.getAttribute("type"), focused: document.activeElement === element }
    })
    expect(dateGeometry.left).toBeGreaterThanOrEqual(0)
    expect(dateGeometry.right).toBeLessThanOrEqual(width)
    expect(dateGeometry.type).toBe("datetime-local")
    expect(dateGeometry.focused).toBe(true)
    rejectSave = true
    await page.getByLabel("修改容量", { exact: true }).fill("24")
    await page.getByRole("button", { name: "保存团期修改", exact: true }).click()
    await expect(sessionForm.getByText("保存服务暂不可用，请稍后重试", { exact: true })).toBeVisible()
    await expect(sessions.getByRole("status")).toHaveCount(0)
    await expect(sessionRow.locator(":scope > span").filter({ hasText: /^12 人$/u })).toBeVisible()
    await sessionForm.locator(".form-error").evaluate(element => element.scrollIntoView({ block: "center" }))
    await capture(page, `session-save-error-${width}`)
    expect(errors).toEqual([])
    expect(unexpected).toEqual([])
    const runtime = await page.evaluate(() => ({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: navigator.language, scrollWidth: document.documentElement.scrollWidth }))
    expect(runtime.timeZone).toBe("America/Los_Angeles")
    await writeFile(`${evidence}/results-${width}.json`, JSON.stringify({ width, status: "PASS", browserVersion: page.context().browser()?.version(), runtime, dateGeometry, errors, unexpected, patches }, null, 2))
  })
}
