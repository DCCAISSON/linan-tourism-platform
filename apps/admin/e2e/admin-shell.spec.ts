import { expect, test } from "@playwright/test"

test("shows the login shell and enters the empty admin home", async ({ page }) => {
  await page.goto("/login")

  await expect(page.getByRole("heading", { name: "管理后台登录" })).toBeVisible()
  await expect(page.getByPlaceholder("等待正式认证服务").first()).toBeDisabled()

  await page.getByRole("button", { name: "进入后台骨架" }).click()

  await expect(page.getByRole("heading", { name: "研学出行服务台" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "等待接入学校、团期、订单和名单模块" })).toBeVisible()
})
