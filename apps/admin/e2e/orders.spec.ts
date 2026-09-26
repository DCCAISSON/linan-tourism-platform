import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"
type Refund = { id: string; status: "pending" | "succeeded" | "failed"; amountFen: number; reason: string; note: string | null; requestedAt: string; processedAt: string | null; failureMessage: string | null; lines: { lineId: string; displayName: string; amountFen: number }[] }
type Capabilities = { readonly wechatPaymentEnabled: boolean; readonly wechatRefundEnabled: boolean; readonly paymentReconciliationEnabled: boolean }

async function installOrdersFixture(page: Page, existingResult?: "succeeded" | "failed", permissionKeys: readonly string[] = ["orders.read", "refunds.manage"], capabilities: Capabilities = { wechatPaymentEnabled: true, wechatRefundEnabled: true, paymentReconciliationEnabled: true }): Promise<void> {
  await installStaffAuthMock(page, permissionKeys, capabilities)
  const refunds: Refund[] = []
  const order = { id: "order-1", code: "ORDER-001", payerName: "陈女士", status: "paid", amountFen: 25600, paidFen: 25600, participantCount: 2, activityTitle: "临安研学", schoolName: "临安实验小学", startsAt: "2027-02-01T00:00:00.000Z", createdAt: "2026-09-21T00:00:00.000Z" }
  await page.route(`${apiBase}/staff/orders?**`, route => route.fulfill({ json: { orders: [order], total: 1, page: 1, pageSize: 20 } }))
  await page.route(`${apiBase}/staff/orders/order-1`, route => {
    const refunded = refunds.some(refund => refund.status === "succeeded")
    const pending = refunds.some(refund => refund.status === "pending")
    return route.fulfill({ json: {
      ...order, contactName: "陈女士", emergencyContactName: null, emergencyContactPhone: null,
      refundSummary: { status: refunded ? "partial" : "none", refundedFen: refunded ? 12800 : 0, pendingFen: pending ? 12800 : 0, failedCount: refunds.filter(refund => refund.status === "failed").length },
      refundHistory: [...refunds].reverse(),
      participants: [
        { id: "line-1", displayName: "学生甲", gradeName: "一年级", className: "一班", amountFen: 12800, refundedFen: refunded ? 12800 : 0, refundStatus: refunded ? "refunded" : pending ? "pending" : refunds.length > 0 ? "failed" : "none" },
        { id: "line-2", displayName: "学生乙", gradeName: "一年级", className: "一班", amountFen: 12800, refundedFen: 0, refundStatus: "none" },
      ],
    } })
  })
  await page.route(`${apiBase}/staff/orders/order-1/refunds`, async route => {
    const body: unknown = route.request().postDataJSON()
    expect(body).toMatchObject({ lineIds: ["line-1"], reason: "学生临时无法参加", idempotencyKey: expect.any(String) })
    expect(body).not.toHaveProperty("amountFen")
    const refund: Refund = { id: `refund-${refunds.length + 1}`, status: "pending", amountFen: 12800, reason: "学生临时无法参加", note: "已电话核实", requestedAt: "2026-09-22T01:00:00.000Z", processedAt: null, failureMessage: null, lines: [{ lineId: "line-1", displayName: "学生甲", amountFen: 12800 }] }
    refunds.push(refund)
    await route.fulfill({ json: { ...refund, orderId: order.id } })
  })
  await page.route(`${apiBase}/staff/orders/order-1/refunds/*/local-result`, async route => {
    const body: unknown = route.request().postDataJSON()
    const refund = refunds.find(item => route.request().url().includes(`/${item.id}/`))
    expect(refund).toBeDefined()
    if (!refund || typeof body !== "object" || body === null || !("outcome" in body) || (body.outcome !== "succeeded" && body.outcome !== "failed")) throw new Error("Unexpected refund processing request")
    if (existingResult) expect(body.outcome).toBe(existingResult === "failed" ? "succeeded" : "failed")
    refund.status = existingResult ?? body.outcome
    refund.processedAt = "2026-09-22T01:05:00.000Z"
    refund.failureMessage = refund.status === "failed" ? "处理失败" : null
    await route.fulfill({ json: { ...refund, orderId: order.id } })
  })
}

async function createRefund(page: Page): Promise<void> {
  await page.getByLabel("选择取消 学生甲").check()
  await expect(page.getByRole("button", { name: "创建退款", exact: true })).toBeDisabled()
  await page.getByLabel("退款原因（必填）").fill("学生临时无法参加")
  await page.getByLabel("备注（选填）").fill("已电话核实")
  await page.getByRole("button", { name: "创建退款", exact: true }).click()
  await expect(page.getByRole("group", { name: "确认创建退款" })).toContainText("¥128.00")
  await page.getByRole("button", { name: "确认创建退款", exact: true }).click()
  await expect(page.getByText("待处理", { exact: true })).toBeVisible()
}

test("staff creates and processes a persisted partial refund with a wire fixture", async ({ page }, testInfo) => {
  await installOrdersFixture(page)
  await page.goto("/orders")
  await page.getByRole("button", { name: "查看详情" }).click()
  await expect(page.getByLabel("退款原因（必填）")).toBeVisible()
  await createRefund(page)
  await page.reload()
  await page.getByRole("button", { name: "查看详情" }).click()
  await expect(page.getByText("待处理", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "处理成功", exact: true }).click()
  await expect(page.getByRole("group", { name: "确认处理成功" })).toContainText("取消对应人员的名单并释放名额")
  await page.getByRole("button", { name: "确认处理成功", exact: true }).click()
  await expect(page.getByText("已支付（部分退款）", { exact: true })).toBeVisible()
  await expect(page.getByText("处理结果已保存，订单、名单和名额已更新。", { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole("button", { name: "查看详情" }).click()
  await expect(page.getByText("已支付（部分退款）", { exact: true })).toBeVisible()
  await expect(page.getByText("处理成功", { exact: true })).toBeVisible()
  await expect(page.getByLabel("选择取消 学生甲")).toBeDisabled()
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`orders-${width}.png`), fullPage: true })
  }
})

test("failed processing retains history and permits a new refund request", async ({ page }) => {
  await installOrdersFixture(page)
  await page.goto("/orders")
  await page.getByRole("button", { name: "查看详情" }).click()
  await createRefund(page)
  await page.getByRole("button", { name: "处理失败", exact: true }).click()
  await page.getByRole("button", { name: "确认处理失败", exact: true }).click()
  await expect(page.getByText("处理失败", { exact: true })).toBeVisible()
  await expect(page.getByLabel("选择取消 学生甲")).toBeEnabled()
  await createRefund(page)
  await expect(page.getByRole("article", { name: "退款记录" })).toHaveCount(2)
})

test("orders read permission hides refund write actions including pending processing", async ({ page }) => {
  await installOrdersFixture(page)
  await page.goto("/orders")
  await page.getByRole("button", { name: "查看详情" }).click()
  await createRefund(page)
  await installStaffAuthMock(page, ["orders.read"])
  await page.reload()
  await page.getByRole("button", { name: "查看详情" }).click()
  await expect(page.getByText("待处理", { exact: true })).toBeVisible()
  await expect(page.getByText("学生甲", { exact: true })).toBeVisible()
  await expect(page.getByLabel("退款原因（必填）")).toBeHidden()
  await expect(page.getByRole("checkbox")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "创建退款", exact: true })).toBeHidden()
  await expect(page.getByRole("button", { name: "处理成功", exact: true })).toBeHidden()
})

test("refund capability disabled hides refund write actions", async ({ page }) => {
  await installOrdersFixture(page, undefined, ["orders.read", "refunds.manage"], { wechatPaymentEnabled: true, wechatRefundEnabled: false, paymentReconciliationEnabled: true })
  await page.goto("/orders")
  await page.getByRole("button", { name: "查看详情" }).click()
  await expect(page.getByLabel("退款原因（必填）")).toBeHidden()
  await expect(page.getByRole("checkbox")).toHaveCount(0)
})

test("refund execute permission alone does not expose order refund actions", async ({ page }) => {
  await installOrdersFixture(page, undefined, ["orders.read", "refunds.execute"])
  await page.goto("/orders")
  await page.getByRole("button", { name: "查看详情" }).click()
  await expect(page.getByLabel("退款原因（必填）")).toBeHidden()
  await expect(page.getByRole("checkbox")).toHaveCount(0)
})

test("pending refund survives a non-JSON processing failure and can retry", async ({ page }) => {
  await installOrdersFixture(page)
  await page.goto("/orders")
  await page.getByRole("button", { name: "查看详情" }).click()
  await createRefund(page)
  const processingUrl = `${apiBase}/staff/orders/order-1/refunds/*/local-result`
  await page.route(processingUrl, route => route.fulfill({ status: 502, contentType: "text/html", body: "Gateway unavailable" }), { times: 1 })
  await page.getByRole("button", { name: "处理成功", exact: true }).click()
  await page.getByRole("button", { name: "确认处理成功", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("订单服务响应格式不正确")
  await expect(page.getByText("待处理", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "确认处理成功", exact: true }).click()
  await expect(page.getByText("已支付（部分退款）", { exact: true })).toBeVisible()
})

for (const scenario of [
  { submitted: "成功", status: "failed", message: "失败记录已保存，可重新选择人员创建退款。", history: "处理失败" },
  { submitted: "失败", status: "succeeded", message: "处理结果已保存，订单、名单和名额已更新。", history: "处理成功" },
] as const) {
  test(`shows server final ${scenario.status} when a stale page submits ${scenario.submitted}`, async ({ page }) => {
    await installOrdersFixture(page, scenario.status)
    await page.goto("/orders")
    await page.getByRole("button", { name: "查看详情" }).click()
    await createRefund(page)
    await page.getByRole("button", { name: `处理${scenario.submitted}`, exact: true }).click()
    await page.getByRole("button", { name: `确认处理${scenario.submitted}`, exact: true }).click()
    await expect(page.getByRole("status")).toHaveText(scenario.message)
    await expect(page.getByRole("article", { name: "退款记录" })).toContainText(scenario.history)
    switch (scenario.status) {
      case "succeeded": await expect(page.getByLabel("选择取消 学生甲")).toBeDisabled(); break
      case "failed": await expect(page.getByLabel("选择取消 学生甲")).toBeEnabled(); break
    }
  })
}

test("duplicate creation clicks are disabled while the request is pending", async ({ page }) => {
  await installOrdersFixture(page)
  let requestCount = 0
  let releaseRequest = (): void => {}
  const gate = new Promise<void>(resolve => { releaseRequest = resolve })
  await page.route(`${apiBase}/staff/orders/order-1/refunds`, async route => { requestCount += 1; await gate; await route.fallback() })
  await page.goto("/orders")
  await page.getByRole("button", { name: "查看详情" }).click()
  await page.getByLabel("选择取消 学生甲").check()
  await page.getByLabel("退款原因（必填）").fill("学生临时无法参加")
  await page.getByRole("button", { name: "创建退款", exact: true }).click()
  try {
    await page.getByRole("button", { name: "确认创建退款", exact: true }).dblclick()
    await expect(page.getByRole("button", { name: "确认创建退款", exact: true })).toBeDisabled()
    await expect(page.getByLabel("选择取消 学生甲")).toBeDisabled()
    expect(requestCount).toBe(1)
  } finally { releaseRequest() }
  await expect(page.getByText("待处理", { exact: true })).toBeVisible()
  expect(requestCount).toBe(1)
})

test("shows a retryable error when the order service returns a non-JSON failure", async ({ page }) => {
  await installStaffAuthMock(page)
  await page.route(`${apiBase}/staff/orders?**`, route => route.fulfill({ status: 502, contentType: "text/html", body: "Gateway unavailable" }))
  await page.goto("/orders")
  await expect(page.getByRole("alert")).toContainText("订单服务响应格式不正确")
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible()
  await expect(page.getByText("没有符合条件的订单，请调整筛选条件。")).toBeHidden()
})
