import { expect, test } from "@playwright/test"

const apiBase = "http://127.0.0.1:3000"

test("staff first login changes password and sees only granted navigation", async ({ page }, testInfo) => {
  let passwordChanged = false
  await page.route(`${apiBase}/staff/auth/login`, async route => {
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: {
        id: "staff-1",
        username: body.username,
        displayName: "Staff User",
        status: "active",
        forcePasswordChange: !passwordChanged,
        expiresAt: null,
        permissionKeys: [],
        scopes: [],
      },
    })
  })
  await page.route(`${apiBase}/staff/auth/change-password`, async route => {
    passwordChanged = true
    await route.fulfill({ json: { ok: true } })
  })
  await page.route(`${apiBase}/staff/auth/me`, async route => {
    await route.fulfill({
      json: {
        actorId: "staff-1",
        kind: "administrator",
        forcePasswordChange: !passwordChanged,
        permissionKeys: passwordChanged ? ["workbench.read", "orders.read"] : ["workbench.read"],
        scopes: [{ kind: "all", id: null }],
      },
    })
  })
  await page.route(`${apiBase}/capabilities`, async route => {
    await route.fulfill({ json: { wechatPaymentEnabled: true, wechatRefundEnabled: true, paymentReconciliationEnabled: true } })
  })
  await page.route(`${apiBase}/roster/workbench`, async route => {
    await route.fulfill({
      json: {
        generatedAt: "2026-09-21T00:00:00.000Z",
        upcomingFrom: "2026-09-21T00:00:00.000Z",
        upcomingUntil: "2026-10-21T00:00:00.000Z",
        activeActivityCount: 1,
        upcomingSessionCount: 0,
        paidHeadcount: 2,
        paidAmountFen: 25600,
        upcomingSessions: [],
      },
    })
  })

  await page.goto("/login")
  await page.locator('input[autocomplete="username"]').fill("staff-demo")
  await page.locator('input[autocomplete="current-password"]').fill("Admin1234567")
  await page.getByRole("button", { name: "登录后台" }).click()

  await expect(page).toHaveURL(/force-password-change/)
  await page.locator('input[autocomplete="current-password"]').fill("Admin1234567")
  await page.locator('input[autocomplete="new-password"]').fill("Changed123456")
  await page.getByRole("button", { name: "修改并进入后台" }).click()

  await expect(page).toHaveURL(/home/)
  await expect(page.getByRole("link", { name: "工作台" })).toBeVisible()
  await page.locator(".admin-nav summary").filter({ hasText: "研学运营" }).click()
  await expect(page.getByRole("link", { name: "订单管理" })).toBeVisible()
  await expect(page.getByRole("link", { name: "账号权限" })).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath("staff-auth-lifecycle.png"), fullPage: true })
})
