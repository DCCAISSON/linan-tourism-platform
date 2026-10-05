import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"
const sessions = ["1", "2"].map(id => ({ id: `session-${id}`, organizationId: `school-${id}`, catalogItemId: "catalog-1", code: `研学团期${id}`, startsAt: "2026-10-15T00:00:00.000Z", endsAt: "2026-10-15T08:00:00.000Z", status: "published", priceFen: 100, capacity: 30 }))

test.beforeEach(async ({ page }) => {
  await installStaffAuthMock(page, ["workbench.read", "roster.read", "transport.read", "transport.write", "pretrip.write"])
  await page.route(`${apiBase}/tour-sessions`, route => route.fulfill({ json: sessions }))
  await page.route(`${apiBase}/schools`, route => route.fulfill({ json: ["1", "2"].map(id => ({ id: `school-${id}`, code: id, name: `学校${id}` })) }))
  await page.route(`${apiBase}/catalog-items`, route => route.fulfill({ json: [{ id: "catalog-1", title: "山水研学" }] }))
  await page.route(`${apiBase}/schools/*/grades`, route => route.fulfill({ json: [] }))
})

test("keeps the selected session through roster, transport and pretrip without writing data", async ({ page }, testInfo) => {
  // Given
  const writes: string[] = []
  page.on("request", request => { if (request.url().startsWith(apiBase) && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.url()) })
  await page.goto("/roster?tourSessionId=session-1")
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("session-1")
  // When
  await page.getByRole("link", { name: "车辆安排", exact: true }).click()
  // Then
  await expect(page).toHaveURL(/\/transport\?tourSessionId=session-1/)
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("session-1")
  await page.getByRole("combobox", { name: "团期", exact: true }).selectOption("session-2")
  await expect(page).toHaveURL(/tourSessionId=session-2/)
  await page.getByRole("link", { name: "行前配置", exact: true }).click()
  await expect(page).toHaveURL(/\/pretrip\?tourSessionId=session-2/)
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("session-2")
  await page.reload()
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("session-2")
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`pretrip-context-${width}.png`), fullPage: true })
  }
  await page.getByRole("link", { name: "名单统计", exact: true }).click()
  await expect(page).toHaveURL(/\/roster\?tourSessionId=session-2/)
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("session-2")
  await page.getByRole("combobox", { name: "团期", exact: true }).selectOption("")
  await expect(page).not.toHaveURL(/tourSessionId/)
  await page.getByRole("link", { name: "车辆安排", exact: true }).click()
  await expect(page).toHaveURL(/\/transport$/)
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("")
  expect(writes).toEqual([])
})

test("does not preselect missing or unauthorized sessions from a link", async ({ page }) => {
  // Given
  await page.route(`${apiBase}/staff/auth/me`, route => route.fulfill({ json: { actorId: "limited", kind: "school", forcePasswordChange: false, permissionKeys: ["roster.read", "transport.read", "pretrip.write"], scopes: [{ kind: "school", id: "school-1" }] } }))
  // When
  for (const path of ["/roster", "/transport", "/pretrip"]) {
    for (const id of ["missing", "session-2"]) {
      await page.goto(`${path}?tourSessionId=${id}`)
      // Then
      await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("")
      await expect(page).not.toHaveURL(/tourSessionId/)
    }
  }
})

test("does not carry a manually chosen unauthorized session into another page", async ({ page }) => {
  // Given
  await page.route(`${apiBase}/staff/auth/me`, route => route.fulfill({ json: { actorId: "limited", kind: "school", forcePasswordChange: false, permissionKeys: ["roster.read", "transport.read", "pretrip.write"], scopes: [{ kind: "school", id: "school-1" }] } }))
  await page.route(`${apiBase}/pretrip/staff/sessions/session-2`, route => route.fulfill({ status: 403, json: { message: "无权读取该团期" } }))
  await page.goto("/pretrip?tourSessionId=session-1")
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("session-1")
  // When
  await page.getByRole("combobox", { name: "团期", exact: true }).selectOption("session-2")
  // Then
  await expect(page).not.toHaveURL(/tourSessionId/)
  await page.getByRole("button", { name: "读取配置", exact: true }).click()
  await expect(page.getByText("无权读取该团期", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "车辆安排", exact: true }).click()
  await expect(page.getByRole("combobox", { name: "团期", exact: true })).toHaveValue("")
})

for (const path of ["/roster", "/travelers", "/transport", "/pretrip"]) {
  test(`carries the latest selection from ${path} while the previous route guard is pending`, async ({ page }) => {
    // Given
    await page.goto(`${path}?tourSessionId=session-1`)
    const selection = page.getByRole("combobox", { name: "团期", exact: true })
    await expect(selection).toHaveValue("session-1")
    await expect(page.getByRole("link", { name: "行前配置", exact: true })).toBeVisible()
    let release: (() => void) | undefined
    let delayed = false
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route(`${apiBase}/staff/auth/me`, async route => {
      if (!delayed) { delayed = true; await pending }
      await route.fallback()
    })
    try {
      // When
      await selection.selectOption("session-2")
      await expect.poll(() => delayed).toBe(true)
      await page.getByRole("link", { name: path === "/pretrip" ? "车辆安排" : "行前配置", exact: true }).click()
      // Then
      await expect(page).toHaveURL(new RegExp(`${path === "/pretrip" ? "/transport" : "/pretrip"}\\?tourSessionId=session-2`))
      await expect(selection).toHaveValue("session-2")
    } finally { release?.() }
  })
}
