import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"

test("staff account drawer fits a mobile viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await installStaffAuthMock(page)
  await page.route(apiBase + "/staff/accounts", async route => {
    await route.fulfill({ json: [] })
  })

  await page.goto("/staff-accounts")
  await page.getByTestId("staff-new-account").click()
  await expect(page.getByTestId("staff-account-form")).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({ path: testInfo.outputPath("staff-account-mobile-drawer.png"), fullPage: true })
})
test("staff account actions remain usable as mobile cards", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await installStaffAuthMock(page)
  let resetCalled = false
  let disableCalled = false
  await page.route(apiBase + "/staff/accounts", async route => {
    await route.fulfill({
      json: [
        {
          id: "staff-mobile-1",
          username: "mobile-admin",
          displayName: "Mobile Reviewer",
          status: "active",
          forcePasswordChange: false,
          expiresAt: null,
          permissionKeys: ["workbench.read", "staff_accounts.manage"],
          scopes: [{ kind: "all", id: null }],
        },
      ],
    })
  })
  await page.route(apiBase + "/staff/accounts/staff-mobile-1/reset-password", async route => {
    resetCalled = true
    await route.fulfill({ json: { ok: true } })
  })
  await page.route(apiBase + "/staff/accounts/staff-mobile-1/disable", async route => {
    disableCalled = true
    await route.fulfill({ json: { ok: true } })
  })

  page.on("dialog", async dialog => {
    await dialog.accept("ResetPass2026")
  })

  await page.goto("/staff-accounts")
  const card = page.getByTestId("staff-mobile-card").filter({ hasText: "mobile-admin" })
  await expect(card).toBeVisible()
  await expect(card.getByText("管理员工账号")).toBeVisible()
  await expect(card.getByRole("button", { name: "重置密码" })).toBeVisible()
  await expect(card.getByRole("button", { name: "停用" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  await card.getByRole("button", { name: "重置密码" }).click()
  expect(resetCalled).toBe(true)
  await card.getByRole("button", { name: "停用" }).click()
  expect(disableCalled).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("staff-account-mobile-cards.png"), fullPage: true })
})
test("staff account table remains available on desktop", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await installStaffAuthMock(page)
  await page.route(apiBase + "/staff/accounts", async route => {
    await route.fulfill({
      json: [
        {
          id: "staff-desktop-1",
          username: "desktop-admin",
          displayName: "Desktop Reviewer",
          status: "active",
          forcePasswordChange: false,
          expiresAt: null,
          permissionKeys: ["workbench.read", "staff_accounts.manage"],
          scopes: [{ kind: "all", id: null }],
        },
      ],
    })
  })

  await page.goto("/staff-accounts")
  const table = page.locator(".staff-page__table")
  await expect(table.getByText("desktop-admin")).toBeVisible()
  await expect(table.getByText("管理员工账号")).toBeVisible()
  await expect(page.getByTestId("staff-mobile-card")).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath("staff-account-desktop-table.png"), fullPage: true })
})

test("staff account permission picker hides unavailable finance permissions", async ({ page }) => {
  await installStaffAuthMock(page, undefined, { wechatPaymentEnabled: false, wechatRefundEnabled: false, paymentReconciliationEnabled: false })
  await page.route(apiBase + "/staff/accounts", async route => {
    await route.fulfill({ json: [] })
  })

  await page.goto("/staff-accounts")
  await page.getByTestId("staff-new-account").click()
  await page.locator(".el-select").first().click()
  await expect(page.getByRole("option", { name: "退款申请审核" })).toBeVisible()
  await expect(page.getByRole("option", { name: "退款执行" })).toHaveCount(0)
  await expect(page.getByRole("option", { name: "支付对账" })).toHaveCount(0)
})
