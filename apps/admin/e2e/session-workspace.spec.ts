import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const base = "http://127.0.0.1:3000"
const sessions = ["1", "2"].map(id => ({ id: `session-${id}`, organizationId: `school-${id}`, catalogItemId: "catalog-1", code: `团期${id}`, status: "published", priceFen: 100, capacity: 30, startsAt: "2026-10-15T00:00:00Z", endsAt: "2026-10-15T08:00:00Z" }))

test.beforeEach(async ({ page }) => {
  await installStaffAuthMock(page, ["roster.read", "transport.read", "pretrip.write", "insurance.read", "notifications.read", "notifications.write", "notifications.send", "execution.read", "execution.manage", "evaluations.read", "roster.export"])
  await page.route(`${base}/tour-sessions`, route => route.fulfill({ json: sessions }))
  await page.route(`${base}/schools`, route => route.fulfill({ json: ["1", "2"].map(id => ({ id: `school-${id}`, code: id, name: `学校${id}` })) }))
  await page.route(`${base}/catalog-items`, route => route.fulfill({ json: [{ id: "catalog-1", title: "山水研学" }] }))
  await page.route(`${base}/staff/notifications/sessions`, route => route.fulfill({ json: sessions.map(row => ({ id: row.id, label: row.code })) }))
  await page.route(`${base}/staff/execution/management/sessions`, route => route.fulfill({ json: sessions.map(row => ({ ...row, vehicleIds: [] })) }))
  await page.route(`${base}/evaluations/sessions`, route => route.fulfill({ json: sessions.map(row => ({ ...row, title: "山水研学" })) }))
  await page.route(`${base}/staff/session-archives/sessions`, route => route.fulfill({ json: sessions.map(row => ({ ...row, sections: ["roster"] })) }))
})

test("keeps the chosen session across the workspace modules without writing", async ({ page }) => {
  // Given
  const writes: string[] = []
  page.on("request", request => { if (request.url().startsWith(base) && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.url()) })
  await page.goto("/roster?tourSessionId=session-1")
  const workspace = page.getByRole("region", { name: "团期工作空间" })
  // When
  await workspace.getByRole("link", { name: "保险工作台", exact: true }).click()
  // Then
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("session-1")
  await expect(workspace).toContainText("学校1")
  for (const [label, path, field] of [["通知管理", "/notifications", "团期"], ["执行管理", "/execution/management", "执行团期"], ["学生评价", "/evaluations", "团期"], ["团期归档", "/session-archives", "选择团期"]] as const) {
    await workspace.getByRole("link", { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${path}\\?tourSessionId=session-1$`))
    await expect(page.getByRole("combobox", { name: field, exact: true })).toHaveValue("session-1")
  }
  await page.reload()
  await expect(page.getByRole("combobox", { name: "选择团期", exact: true })).toHaveValue("session-1")
  expect(writes).toEqual([])
})

test("keeps the active workspace module visible after text and viewport resizing", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto("/insurance?tourSessionId=session-1")
  const navigation = page.getByRole("navigation", { name: "本团期模块" })
  const active = navigation.getByRole("link", { name: "保险工作台", exact: true })
  await expect(active).toHaveClass(/router-link-exact-active/)
  const activeFits = () => navigation.evaluate(element => {
    const item = element.querySelector(".router-link-exact-active")?.getBoundingClientRect()
    const parent = element.getBoundingClientRect()
    return !!item && item.left >= parent.left - 1 && item.right <= parent.right + 1
  })
  await expect.poll(activeFits).toBe(true)
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll("body *")].map(element => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }))
    for (const { element, size } of sizes) if (element instanceof HTMLElement) element.style.setProperty("font-size", `${size * 1.25}px`, "important")
  })
  await expect.poll(activeFits).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("workspace-active-large-text-375.png"), fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect.poll(activeFits).toBe(true)
  await page.setViewportSize({ width: 768, height: 900 })
  await expect.poll(activeFits).toBe(true)
  await page.setViewportSize({ width: 375, height: 900 })
  await expect.poll(activeFits).toBe(true)
})

for (const [path, field] of [["/insurance", "团期"], ["/notifications", "团期"], ["/execution/management", "执行团期"], ["/evaluations", "团期"], ["/session-archives", "选择团期"]] as const) {
  test(`carries the latest pending session from ${path}`, async ({ page }) => {
    // Given
    await page.goto(`${path}?tourSessionId=session-1`)
    const selection = page.getByRole("combobox", { name: field, exact: true })
    await expect(selection).toHaveValue("session-1")
    let release: (() => void) | undefined
    let delayed = false
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route(`${base}/staff/auth/me`, async route => {
      if (!delayed) { delayed = true; await pending }
      await route.fallback()
    })
    try {
      // When
      await selection.selectOption("session-2")
      await expect.poll(() => delayed).toBe(true)
      await page.getByRole("region", { name: "团期工作空间" }).getByRole("link", { name: "行前配置", exact: true }).click()
      // Then
      await expect(page).toHaveURL(/\/pretrip\?tourSessionId=session-2$/)
      await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("session-2")
    } finally { release?.() }
  })
}

test("removes inaccessible module entries and rejects a missing session", async ({ page }) => {
  // Given
  await page.route(`${base}/evaluations/sessions`, route => route.fulfill({ json: [] }))
  await page.goto("/roster?tourSessionId=session-1")
  const workspace = page.getByRole("region", { name: "团期工作空间" })
  // When
  await expect(workspace.getByRole("link", { name: "保险工作台", exact: true })).toBeVisible()
  // Then
  await expect(workspace.getByRole("link", { name: "学生评价", exact: true })).toHaveCount(0)
  await page.goto("/insurance?tourSessionId=missing")
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("")
  await expect(page).not.toHaveURL(/tourSessionId/)
})

test("reads only the selected session and keeps failed status unknown", async ({ page }) => {
  // Given
  const statusRequests: string[] = []
  await page.route(`${base}/pretrip/staff/sessions/*`, route => {
    statusRequests.push(route.request().url())
    return route.fulfill({ json: { tourSessionId: "session-1", gatheringAt: null, gatheringPlace: "", gatheringLatitude: null, gatheringLongitude: null, travelMode: "group", itineraryNote: "", contactName: "", contactPhone: "", serviceContact: "", noticeVersionId: null, version: 0, attachments: [] } })
  })
  await page.route(`${base}/pretrip/staff/sessions/*/school-confirmations`, route => {
    statusRequests.push(route.request().url()); return route.fulfill({ json: [] })
  })
  await page.route(`${base}/insurance/sessions/*/latest`, route => {
    statusRequests.push(route.request().url()); return route.fulfill({ status: 503, json: { message: "读取失败" } })
  })
  await page.route(`${base}/staff/notifications/sessions/*`, route => {
    statusRequests.push(route.request().url()); return route.fulfill({ json: { sources: [], contents: [], entries: [], tasks: [], canWrite: true, canSend: true, wechatConfigured: true } })
  })
  await page.goto("/roster?tourSessionId=session-1")
  const workspace = page.getByRole("region", { name: "团期工作空间" })
  await workspace.getByText("本团行前准备", { exact: true }).click()
  expect(statusRequests).toEqual([])
  // When
  await workspace.getByRole("button", { name: "读取最新状态" }).click()
  // Then
  await expect(workspace.getByRole("listitem").filter({ hasText: "行前信息" })).toContainText("待配置")
  await expect(workspace.getByRole("listitem").filter({ hasText: "学校签认" })).toContainText("缺少有效签认")
  await expect(workspace.getByRole("listitem").filter({ hasText: "保险交接" })).toContainText("暂时无法读取")
  expect(statusRequests).toHaveLength(4)
  expect(statusRequests.every(url => url.includes("session-1"))).toBe(true)
  await page.getByRole("combobox", { name: "团期", exact: true }).selectOption("session-2")
  await expect(workspace.getByRole("listitem")).toHaveCount(0)
  expect(statusRequests).toHaveLength(4)
})

test("does not expose a session outside the staff and module scope", async ({ page }) => {
  // Given
  await page.route(`${base}/staff/auth/me`, route => route.fulfill({ json: { actorId: "school-staff", kind: "school", forcePasswordChange: false, permissionKeys: ["insurance.read", "notifications.read", "notifications.write", "notifications.send", "execution.read", "execution.manage", "evaluations.read", "roster.export"], scopes: [{ kind: "school", id: "school-1" }] } }))
  await page.route(`${base}/staff/notifications/sessions`, route => route.fulfill({ json: [{ id: "session-1", label: "团期1" }] }))
  await page.route(`${base}/staff/execution/management/sessions`, route => route.fulfill({ json: [{ ...sessions[0], vehicleIds: [] }] }))
  await page.route(`${base}/evaluations/sessions`, route => route.fulfill({ json: [{ ...sessions[0], title: "山水研学" }] }))
  await page.route(`${base}/staff/session-archives/sessions`, route => route.fulfill({ json: [{ ...sessions[0], sections: ["roster"] }] }))
  // When
  for (const [path, field] of [["/insurance", "团期"], ["/notifications", "团期"], ["/execution/management", "执行团期"], ["/evaluations", "团期"], ["/session-archives", "选择团期"]] as const) {
    await page.goto(`${path}?tourSessionId=session-2`)
    // Then
    await expect(page.getByRole("combobox", { name: field, exact: true })).toHaveValue("")
    await expect(page).not.toHaveURL(/tourSessionId/)
    await expect(page.getByRole("region", { name: "团期工作空间" }).getByRole("link")).toHaveCount(0)
  }
})
