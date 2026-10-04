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

  await expect(page.locator(".admin-nav summary")).toHaveCount(5)
  for (const group of await page.locator(".admin-nav details").all()) {
    if (await group.getAttribute("open") === null) await group.locator("summary").click()
  }
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
  await expect(page.locator(".admin-nav summary")).toHaveText(["今日工作"])
})

test("keeps permitted navigation accessible after keyboard collapse and a page shortcut", async ({ page }) => {
  await installStaffAuthMock(page, [
    "workbench.read", "configuration.read", "roster.read", "orders.read", "refunds.review", "payments.reconcile",
    "transport.read", "pretrip.write", "pretrip.school_confirm", "execution.read", "execution.manage", "health.read",
    "evaluations.read", "evaluations.standard.write", "insurance.read", "media.read", "notifications.read",
    "notifications.write", "notifications.send", "feedback.read", "crm.read", "business.read", "staff_accounts.manage",
  ])
  await page.route(apiBase + "/roster/workbench", route => route.fulfill({ json: {
    generatedAt: "2026-10-04T00:00:00Z", upcomingFrom: "2026-10-04T00:00:00Z", upcomingUntil: "2026-11-03T00:00:00Z",
    activeActivityCount: 0, upcomingSessionCount: 0, paidHeadcount: 0, paidAmountFen: 0, upcomingSessions: [],
  } }))
  await page.route(apiBase + "/staff/orders?**", route => route.fulfill({ json: { orders: [], total: 0, page: 1, pageSize: 20 } }))
  await page.goto("/home")
  const navigation = page.getByRole("navigation", { name: "主要菜单" })
  await expect(navigation.locator("summary")).toHaveText(["今日工作", "研学运营", "出团执行", "客户服务", "系统管理"])
  await expect(navigation.locator("details[open] summary")).toHaveText(["今日工作"])
  for (const group of await navigation.locator("details").all()) {
    if (await group.getAttribute("open") === null) await group.locator("summary").click()
  }
  await expect(navigation.getByRole("link")).toHaveCount(25)
  const operations = navigation.locator("details").filter({ has: page.locator("summary", { hasText: "研学运营" }) })
  await operations.locator("summary").focus()
  await page.keyboard.press("Enter")
  await expect(operations).not.toHaveAttribute("open")
  await expect(navigation.getByRole("link", { name: "订单管理", exact: true })).toBeHidden()

  await page.getByRole("link", { name: "查看订单与退款" }).click()

  await expect(page).toHaveURL(/\/orders$/)
  await expect(operations).toHaveAttribute("open")
  await expect(navigation.getByRole("link", { name: "订单管理", exact: true })).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("没有符合条件的订单，请调整筛选条件。")).toBeVisible()
})
