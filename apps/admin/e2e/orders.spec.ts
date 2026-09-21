import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"

test("staff reviews an order and validates a one-person refund without settling it", async ({ page }, testInfo) => {
  await installStaffAuthMock(page)
  await page.route(`${apiBase}/staff/orders?**`, async route => {
    await route.fulfill({ json: {
      orders: [{ id: "order-1", code: "ORDER-001", enrollmentId: "enrollment-1", payerName: "陈女士", status: "paid", amountFen: 25600, paidFen: 25600, participantCount: 2, tourSessionId: "session-1", activityTitle: "临安研学", schoolName: "临安实验小学", startsAt: "2027-02-01T00:00:00.000Z", endsAt: "2027-02-02T00:00:00.000Z", createdAt: "2026-09-21T00:00:00.000Z" }],
      total: 1, page: 1, pageSize: 20,
    } })
  })
  await page.route(`${apiBase}/staff/orders/order-1`, async route => {
    await route.fulfill({ json: {
      id: "order-1", code: "ORDER-001", enrollmentId: "enrollment-1", payerName: "陈女士", status: "paid", amountFen: 25600, paidFen: 25600, participantCount: 2, tourSessionId: "session-1", activityTitle: "临安研学", schoolName: "临安实验小学", startsAt: "2027-02-01T00:00:00.000Z", endsAt: "2027-02-02T00:00:00.000Z", createdAt: "2026-09-21T00:00:00.000Z", contactName: "陈女士", emergencyContactName: "王先生", emergencyContactPhone: "13900000008",
      participants: [{ id: "line-1", enrollmentParticipantId: "participant-1", displayName: "学生甲", gradeName: "一年级", className: "一班", amountFen: 12800 }, { id: "line-2", enrollmentParticipantId: "participant-2", displayName: "学生乙", gradeName: "一年级", className: "一班", amountFen: 12800 }],
    } })
  })
  await page.route(`${apiBase}/staff/orders/order-1/refund-preview`, async route => {
    expect(route.request().postDataJSON()).toEqual({ lineIds: ["line-1"] })
    await route.fulfill({ json: { mode: "local_validation", settlementPerformed: false, orderId: "order-1", participantCount: 1, amountFen: 12800, lines: [{ lineId: "line-1", displayName: "学生甲", amountFen: 12800 }] } })
  })
  await page.route(`${apiBase}/staff/orders/order-1/refund-simulation`, async route => {
    expect(route.request().postDataJSON()).toEqual({ lineIds: ["line-1"], outcome: "succeeded" })
    await route.fulfill({ json: { mode: "local_validation", settlementPerformed: false, orderId: "order-1", participantCount: 1, amountFen: 12800, lines: [{ lineId: "line-1", displayName: "学生甲", amountFen: 12800 }], outcome: "succeeded" } })
  })

  await page.goto("/orders")
  await expect(page.getByRole("heading", { name: "订单管理" })).toBeVisible()
  await page.getByRole("button", { name: "查看详情" }).click()
  await expect(page.getByText("学生甲")).toBeVisible()
  await page.getByLabel("选择取消 学生甲").check()
  await page.getByRole("button", { name: "计算退款金额" }).click()
  await expect(page.getByText("试算退款：¥128.00")).toBeVisible()
  await page.getByRole("button", { name: "模拟成功" }).click()
  await expect(page.getByText("本地模拟成功，未实际退款")).toBeVisible()
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`orders-${width}.png`), fullPage: true })
  }
})

test("shows a retryable error when the order service returns a non-JSON failure", async ({ page }) => {
  await installStaffAuthMock(page)
  await page.route(`${apiBase}/staff/orders?**`, async route => {
    await route.fulfill({ status: 502, contentType: "text/html", body: "Gateway unavailable" })
  })
  await page.goto("/orders")
  await expect(page.getByRole("alert")).toContainText("订单服务响应格式不正确")
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible()
  await expect(page.getByText("没有符合条件的订单，请调整筛选条件。")).toBeHidden()
})
