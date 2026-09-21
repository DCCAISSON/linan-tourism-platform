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
  await page.getByRole("button", { name: "新建账号" }).click()
  await expect(page.getByRole("heading", { name: "新建工作人员账号" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({ path: testInfo.outputPath("staff-account-mobile-drawer.png"), fullPage: true })
})
