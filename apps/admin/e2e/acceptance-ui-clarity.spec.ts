import { expect, test } from "@playwright/test"
import { installRosterOptions } from "./roster-options"
import { installStaffAuthMock } from "./staff-auth-mock"
import type { RefundApplication } from "../src/api/refund-applications"

const apiBase = "http://127.0.0.1:3000"

test("keeps refund approval separate from execution and channel completion", async ({ page }) => {
  await installStaffAuthMock(page, ["refunds.review", "refunds.execute"])
  let application: RefundApplication = {
    id: "application-1", orderId: "order-1", status: "submitted", reason: "行程调整", amountFen: 19500,
    lines: [{ lineId: "line-1", displayName: "学生甲", amountFen: 19500 }],
    submittedAt: "2026-10-04T00:00:00Z", updatedAt: "2026-10-04T00:00:00Z", reviewReason: "", reviewedAt: "",
    refundRequestId: null, refundStatus: null,
  }
  let executionCount = 0
  await page.route(`${apiBase}/staff/refund-applications`, route => route.fulfill({ json: [application] }))
  await page.route(`${apiBase}/staff/refund-applications/application-1/review`, route => {
    expect(route.request().postDataJSON()).toEqual({ decision: "approved", reason: "已核对申请" })
    application = { ...application, status: "approved", reviewReason: "已核对申请" }
    return route.fulfill({ json: application })
  })
  await page.route(`${apiBase}/staff/refund-applications/application-1/execute`, route => {
    executionCount += 1
    application = { ...application, refundRequestId: "refund-1", refundStatus: "pending" }
    return route.fulfill({ json: application })
  })
  await page.goto("/refund-applications")
  await page.getByLabel("审核理由", { exact: true }).fill("已核对申请")
  await page.getByRole("button", { name: "批准", exact: true }).click()
  await expect(page.getByText("待执行退款", { exact: true })).toBeVisible()
  await expect(page.getByText("退款成功", { exact: true })).toHaveCount(0)
  expect(executionCount).toBe(0)
  await page.getByRole("button", { name: "执行微信退款", exact: true }).click()
  await expect(page.getByText("退款处理中", { exact: true })).toBeVisible()
  await expect(page.getByText("退款成功", { exact: true })).toHaveCount(0)
  expect(executionCount).toBe(1)
  application = { ...application, refundStatus: "succeeded" }
  await page.getByRole("button", { name: "刷新申请", exact: true }).click()
  await expect(page.getByText("退款成功", { exact: true })).toBeVisible()
  expect(executionCount).toBe(1)
})

test("does not present a refund load failure as an empty list and allows retry", async ({ page }) => {
  await installStaffAuthMock(page, ["refunds.review"])
  let failed = true
  await page.route(`${apiBase}/staff/refund-applications`, route => failed
    ? route.fulfill({ status: 503, json: { message: "退款申请暂时无法加载" } })
    : route.fulfill({ json: [] }))
  await page.goto("/refund-applications")
  await expect(page.getByRole("alert")).toContainText("退款申请暂时无法加载")
  await expect(page.getByText("当前筛选下没有退款申请，可调整申请状态或刷新查看。")).toHaveCount(0)
  failed = false
  await page.getByRole("button", { name: "重试", exact: true }).click()
  await expect(page.getByText("当前筛选下没有退款申请，可调整申请状态或刷新查看。")).toBeVisible()
})

test("separates historical gross payments from successful refunds and clears failed statistics", async ({ page }) => {
  await installStaffAuthMock(page, ["roster.read", "execution.read", "orders.read"])
  await installRosterOptions(page)
  let failed = false
  await page.route(`${apiBase}/roster/date-statistics?**`, route => {
    const params = new URL(route.request().url()).searchParams
    expect(params.get("from")).toBe("2026-10-01")
    expect(params.get("until")).toBe("2026-10-07")
    return failed ? route.fulfill({ status: 503, json: { message: "暂时无法查询" } }) : route.fulfill({ json: {
      rows: [{ sessionId: "session-1", code: "QYX-1004", schoolName: "临安实验小学", startsAt: "2026-10-04T00:00:00Z", paidHeadcount: 0, paymentAmountFen: 39000, refundAmountFen: 39000, presentHeadcount: 0, confirmationMissing: false, attendanceIncomplete: false }],
      totals: { paidHeadcount: 0, paymentAmountFen: 39000, refundAmountFen: 39000, presentHeadcount: 0, confirmationMissing: 0, attendanceIncomplete: 0 },
    } })
  })
  await page.goto("/roster")
  const panel = page.getByRole("region", { name: "按出行日期汇总" })
  await panel.getByLabel("开始日期").fill("2026-10-01")
  await panel.getByLabel("结束日期").fill("2026-10-07")
  await panel.getByRole("button", { name: "查询日期汇总" }).click()
  await expect(panel.locator("article").filter({ hasText: "累计支付金额" })).toContainText("¥390.00")
  await expect(panel.locator("article").filter({ hasText: "成功退款金额" })).toContainText("¥390.00")
  await expect(panel).toContainText("按团期出发日期筛选")
  await expect(panel).toContainText("累计支付保留已退款订单的原支付金额，不扣减退款")
  failed = true
  await panel.getByRole("button", { name: "查询日期汇总" }).click()
  await expect(panel.getByRole("alert")).toBeVisible()
  await expect(panel.getByText("¥390.00", { exact: true })).toHaveCount(0)
})
