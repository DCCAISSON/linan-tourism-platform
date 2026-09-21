import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"

test("logs in through staff auth and enters the API-backed workbench", async ({ page }) => {
  await page.route(apiBase + "/staff/auth/login", async route => {
    await route.fulfill({
      json: {
        id: "staff-e2e",
        username: "staff-e2e",
        displayName: "E2E Staff",
        status: "active",
        forcePasswordChange: false,
        expiresAt: null,
        permissionKeys: [],
        scopes: [],
      },
    })
  })
  await installStaffAuthMock(page)
  await page.route(apiBase + "/roster/workbench", route => route.fulfill({
    json: {
      generatedAt: "2026-09-17T00:00:00.000Z",
      upcomingFrom: "2026-09-17T00:00:00.000Z",
      upcomingUntil: "2026-10-17T00:00:00.000Z",
      activeActivityCount: 1,
      upcomingSessionCount: 0,
      paidHeadcount: 2,
      paidAmountFen: 25600,
      upcomingSessions: [],
    },
  }))

  await page.goto("/login")
  await page.locator('input[autocomplete="username"]').fill("staff-e2e")
  await page.locator('input[autocomplete="current-password"]').fill("Admin1234567")
  await page.getByRole("button", { name: "登录后台" }).click()

  await expect(page).toHaveURL(/home/)
  await expect(page.getByTestId("workbench-paid-headcount")).toHaveText("2 人")
  await expect(page.getByTestId("workbench-paid-amount")).toHaveText("¥256.00")
})
