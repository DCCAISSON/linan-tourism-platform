import { expect, test } from "@playwright/test"

test("shows the login shell and enters the API-backed workbench", async ({ page }) => {
  await page.route("http://127.0.0.1:3000/roster/workbench", route => route.fulfill({
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

  await expect(page.getByRole("heading", { name: "管理后台登录" })).toBeVisible()
  await expect(page.getByPlaceholder("等待正式认证服务").first()).toBeDisabled()

  await page.getByRole("button", { name: "进入本地演示" }).click()

  await expect(page.getByRole("heading", { name: "研学出行服务台" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "工作台" , exact: true })).toBeVisible()
  await expect(page.getByTestId("workbench-paid-headcount")).toHaveText("2 人")
  await expect(page.getByTestId("workbench-paid-amount")).toHaveText("¥256.00")
  await expect(page.getByText("未来30天暂无已发布团期。")).toBeVisible()
  await page.getByRole("link", { name: "管理学校、课程与团期" }).click()
  await expect(page.getByRole("heading", { name: "学校、课程与团期配置" })).toBeVisible()
})
