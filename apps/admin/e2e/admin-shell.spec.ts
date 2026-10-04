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

test("shows integrated navigation entries granted to the staff account", async ({ page }, testInfo) => {
  await installStaffAuthMock(page, ["workbench.read", "roster.read", "refunds.review", "pretrip.write", "pretrip.school_confirm", "notifications.read", "notifications.write", "notifications.send", "execution.read", "health.read", "evaluations.read", "evaluations.standard.write", "feedback.read", "insurance.read", "media.read", "crm.read", "business.read"])
  await page.route(apiBase + "/roster/workbench", route => route.fulfill({
    json: {
      generatedAt: "2026-09-23T00:00:00.000Z",
      upcomingFrom: "2026-09-23T00:00:00.000Z",
      upcomingUntil: "2026-10-23T00:00:00.000Z",
      activeActivityCount: 0,
      upcomingSessionCount: 0,
      paidHeadcount: 0,
      paidAmountFen: 0,
      upcomingSessions: [],
    },
  }))

  await page.goto("/home")

  await expect(page.getByRole("link", { name: "出行人员" })).toBeVisible()
  await expect(page.getByRole("link", { name: "退款申请" })).toBeVisible()
  await expect(page.getByRole("link", { name: "行前配置" })).toBeVisible()
  await expect(page.getByRole("link", { name: "学校行前签认" })).toBeVisible()
  await expect(page.getByRole("link", { name: "通知管理" })).toBeVisible()
  await expect(page.getByRole("link", { name: "导游执行" })).toBeVisible()
  await expect(page.getByRole("link", { name: "健康授权" })).toBeVisible()
  await expect(page.getByRole("link", { name: "学生评价" })).toBeVisible()
  await expect(page.getByRole("link", { name: "评价标准" })).toBeVisible()
  await expect(page.getByRole("link", { name: "服务反馈" })).toBeVisible()
  await expect(page.getByRole("link", { name: "保险工作台" })).toBeVisible()
  await expect(page.getByRole("link", { name: "影像管理" })).toBeVisible()
  await expect(page.getByRole("link", { name: "客户管理" })).toBeVisible()
  await expect(page.getByRole("link", { name: "商旅业务" })).toBeVisible()
  await expect(page.getByRole("link", { name: "支付对账" })).toHaveCount(0)

  for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport)
    await page.screenshot({ fullPage: true, path: testInfo.outputPath(`admin-navigation-${viewport.width}.png`) })
  }
})

test("hides notification management without write and send permissions", async ({ page }) => {
  await installStaffAuthMock(page, ["workbench.read", "notifications.read"])
  await page.route(apiBase + "/roster/workbench", route => route.fulfill({
    json: {
      generatedAt: "2026-09-23T00:00:00.000Z",
      upcomingFrom: "2026-09-23T00:00:00.000Z",
      upcomingUntil: "2026-10-23T00:00:00.000Z",
      activeActivityCount: 0,
      upcomingSessionCount: 0,
      paidHeadcount: 0,
      paidAmountFen: 0,
      upcomingSessions: [],
    },
  }))

  await page.goto("/home")

  await expect(page.getByRole("link", { name: "通知管理" })).toHaveCount(0)
})
