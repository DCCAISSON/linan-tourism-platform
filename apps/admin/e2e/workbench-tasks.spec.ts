import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"
const summary = { generatedAt: "2026-10-04T08:00:00.000Z", upcomingFrom: "2026-10-04T08:00:00.000Z", upcomingUntil: "2026-11-03T08:00:00.000Z", activeActivityCount: 1, upcomingSessionCount: 0, paidHeadcount: 2, paidAmountFen: 20000, upcomingSessions: [] }
const refund = { id: "refund-1", orderId: "order-1", status: "submitted", reason: "行程调整", amountFen: 100, lines: [], submittedAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z", reviewReason: null, reviewedAt: null, refundRequestId: null, refundStatus: null }
const changes = ["submitted", "approved", "needs_information"].map((status, index) => ({ id: `change-${index}`, orderId: "order-1", orderCode: "ORDER-1", kind: "addition", originalLineId: null, reason: "调整人员", status, version: 1, proposedParticipant: { displayName: "参加人", participantKind: "student", schoolName: "学校", gradeName: null, className: null, identityNumberMasked: "***", phoneMasked: "***" }, originalSnapshot: { amountFen: 100, paidFen: 100, lines: [] }, history: [], refundConflict: false, createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z" }))

test.beforeEach(async ({ page }) => {
  await page.route(`${apiBase}/roster/workbench`, route => route.fulfill({ json: summary }))
})

test("shows submitted tasks before statistics and separates approved changes", async ({ page }, testInfo) => {
  // Given
  await installStaffAuthMock(page, ["workbench.read", "refunds.review", "orders.read"])
  await page.route(`${apiBase}/staff/refund-applications?status=submitted`, route => route.fulfill({ json: [refund] }))
  await page.route(`${apiBase}/staff/order-changes`, route => route.fulfill({ json: changes }))
  // When
  await page.goto("/home")
  // Then
  const tasks = page.getByRole("region", { name: "今日待办" })
  await expect(tasks).toBeVisible()
  await expect(page.getByTestId("task-refunds")).toContainText("1 项")
  await expect(page.getByTestId("task-changes-review")).toContainText("1 项")
  await expect(page.getByTestId("task-changes-approved")).toContainText("1 项")
  await expect(page.getByTestId("task-changes-approved")).toContainText("人员变更已通过")
  await expect(tasks.getByTestId("task-changes-approved")).toHaveCount(0)
  await expect(page.getByRole("region", { name: "已通过申请" }).getByTestId("task-changes-approved")).toBeVisible()
  await expect(tasks).toContainText("仅统计待审核申请，包含此前提交的申请。")
  expect(await tasks.evaluate(element => {
    const statistics = document.querySelector('[aria-label="业务统计"]')
    return statistics !== null && Boolean(element.compareDocumentPosition(statistics) & Node.DOCUMENT_POSITION_FOLLOWING)
  })).toBe(true)
  await expect(page.getByTestId("workbench-paid-amount")).toHaveText("¥200.00")
  for (const width of [375, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`workbench-tasks-${width}.png`), fullPage: true })
  }
  await page.getByTestId("task-changes-approved").getByRole("link").click()
  await expect(page).toHaveURL(/\/order-changes/)
})

test("shows a failed task separately from successful counts and retries it", async ({ page }, testInfo) => {
  // Given
  await installStaffAuthMock(page, ["workbench.read", "refunds.review", "orders.read"])
  let failed = true
  await page.route(`${apiBase}/staff/refund-applications?status=submitted`, route => route.fulfill(failed ? { status: 503, json: { message: "暂时无法读取退款申请" } } : { json: [] }))
  await page.route(`${apiBase}/staff/order-changes`, route => route.fulfill({ json: changes }))
  // When
  await page.goto("/home")
  // Then
  await expect(page.getByTestId("task-refunds")).toContainText("暂时无法读取")
  await expect(page.getByTestId("task-refunds")).not.toContainText("0 项")
  await expect(page.getByTestId("task-changes-approved")).toContainText("1 项")
  await expect(page.getByTestId("workbench-paid-amount")).toHaveText("¥200.00")
  await page.setViewportSize({ width: 375, height: 900 })
  await page.getByTestId("task-refunds").getByRole("button", { name: "重试" }).focus()
  await page.screenshot({ path: testInfo.outputPath("workbench-error-focus-375.png"), fullPage: true })
  failed = false
  await page.getByTestId("task-refunds").getByRole("button", { name: "重试" }).click()
  await expect(page.getByTestId("task-refunds")).toContainText("0 项")
  await page.screenshot({ path: testInfo.outputPath("workbench-zero-375.png"), fullPage: true })
})

test("keeps task counts unknown until the request finishes", async ({ page }, testInfo) => {
  // Given
  await installStaffAuthMock(page, ["workbench.read", "refunds.review"])
  let release: (() => void) | undefined
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route(`${apiBase}/staff/refund-applications?status=submitted`, async route => { await pending; await route.fulfill({ json: [] }) })
  // When
  await page.goto("/home")
  // Then
  await expect(page.getByTestId("workbench-paid-amount")).toHaveText("¥200.00")
  await expect(page.getByTestId("task-refunds")).toContainText("读取中")
  await expect(page.getByTestId("task-refunds")).not.toContainText("0 项")
  await page.setViewportSize({ width: 375, height: 900 })
  await page.screenshot({ path: testInfo.outputPath("workbench-loading-375.png"), fullPage: true })
  release?.()
  await expect(page.getByTestId("task-refunds")).toContainText("0 项")
})

test("does not fetch or expose tasks beyond the staff permissions or scope", async ({ page }, testInfo) => {
  // Given
  const requests: string[] = []
  await page.route(`${apiBase}/staff/refund-applications**`, route => { requests.push(route.request().url()); return route.fulfill({ json: [refund] }) })
  await page.route(`${apiBase}/staff/order-changes`, route => { requests.push(route.request().url()); return route.fulfill({ json: changes }) })
  await installStaffAuthMock(page, ["workbench.read"])
  // When
  await page.goto("/home")
  // Then
  await expect(page.getByTestId("workbench-paid-amount")).toBeVisible()
  await expect(page.getByTestId("task-refunds")).toHaveCount(0)
  await expect(page.getByTestId("task-changes-review")).toHaveCount(0)
  expect(requests).toEqual([])
  await page.setViewportSize({ width: 375, height: 900 })
  await page.screenshot({ path: testInfo.outputPath("workbench-no-permission-375.png"), fullPage: true })
  await page.route(`${apiBase}/staff/auth/me`, route => route.fulfill({ json: { actorId: "limited", kind: "school", forcePasswordChange: false, permissionKeys: ["workbench.read", "refunds.review", "orders.read", "roster.read"], scopes: [{ kind: "school", id: "school-1" }] } }))
  await page.reload()
  await expect(page.getByTestId("workbench-paid-amount")).toBeVisible()
  await expect(page.getByTestId("task-refunds")).toHaveCount(0)
  await expect(page.getByTestId("task-changes-review")).toHaveCount(0)
  await expect(page.getByRole("region", { name: "工作台", exact: true }).getByRole("link")).toHaveCount(0)
  expect(requests).toEqual([])
  await page.screenshot({ path: testInfo.outputPath("workbench-limited-scope-375.png"), fullPage: true })
})

for (const wechatRefundEnabled of [false, true]) {
  test(`respects the refund execution capability when it is ${wechatRefundEnabled}`, async ({ page }) => {
    // Given
    const requests: string[] = []
    await installStaffAuthMock(page, ["workbench.read", "refunds.execute"], { wechatPaymentEnabled: true, wechatRefundEnabled, paymentReconciliationEnabled: true })
    await page.route(`${apiBase}/staff/refund-applications?status=submitted`, route => { requests.push(route.request().url()); return route.fulfill({ json: [refund] }) })
    // When
    await page.goto("/home")
    // Then
    await expect(page.getByTestId("workbench-paid-amount")).toBeVisible()
    if (wechatRefundEnabled) {
      await expect(page.getByTestId("task-refunds")).toContainText("1 项")
      expect(requests).toHaveLength(1)
    } else {
      await expect(page.getByTestId("task-refunds")).toHaveCount(0)
      expect(requests).toEqual([])
    }
  })
}
