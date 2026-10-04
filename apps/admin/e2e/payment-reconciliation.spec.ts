import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

test("removes an earlier zero-difference result when the next date has no WeChat bill", async ({ page, baseURL }, testInfo) => {
  // Given
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(baseURL ?? "http://127.0.0.1:5174").origin ? route.continue() : route.abort())
  await installStaffAuthMock(page, ["payments.reconcile"])
  const requests: unknown[] = []
  const failure = "微信未生成该日账单，请在微信商户平台核实当日收款和退款；仅报名未付款不会产生支付账单。"
  const pending = Promise.withResolvers<void>()
  await page.route("http://127.0.0.1:3000/staff/payments/reconciliation", async route => {
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) return route.fulfill({ json: { billDate: "2026-10-02", contentHash: "fixture-previous-hash", differenceCount: 0, confirmedNote: null, differences: [] } })
    await pending.promise
    return route.fulfill({ status: 502, json: { code: "wechat_bill_not_available", message: failure } })
  })
  await page.goto("/payments/reconciliation")
  await page.getByLabel("日期", { exact: true }).fill("2026-10-02")
  await page.getByRole("button", { name: "执行对账", exact: true }).click()
  await expect(page.getByText("0 条差异", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "保存确认", exact: true })).toBeVisible()
  await page.getByLabel("日期", { exact: true }).fill("2026-10-03")
  // When
  await page.getByRole("button", { name: "执行对账", exact: true }).click()
  // Then
  await expect(page.getByText("正在处理微信账单...", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "对账结果", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "保存确认", exact: true })).toHaveCount(0)
  pending.resolve()
  await expect(page.getByRole("alert")).toHaveText(failure)
  await expect(page.getByText("0 条差异", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "保存确认", exact: true })).toHaveCount(0)
  await expect(page.getByRole("table", { name: "微信支付对账差异" })).toHaveCount(0)
  expect(requests).toEqual([{ date: "2026-10-02" }, { date: "2026-10-03" }])
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`missing-bill-${width}.png`), fullPage: true })
  }
})
