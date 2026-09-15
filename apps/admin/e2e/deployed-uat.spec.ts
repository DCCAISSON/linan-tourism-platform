import { expect, test } from "@playwright/test"

test("creates a fictitious school through the deployed admin and API", async ({ page }) => {
  test.skip(process.env["DEPLOY_UAT"] !== "1", "runs only against the deployed UAT stack")
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text())
    }
  })

  await page.goto("/configuration")
  await expect(page.getByRole("heading", { name: "学校、课程与团期配置" })).toBeVisible()
  await page.getByLabel("学校名称").fill("容器验收学校")
  await page.getByLabel("学校编码").fill(`UAT-${Date.now()}`)
  await page.getByRole("button", { name: "新增学校" }).click()
  await expect(page.getByRole("region", { name: "学校", exact: true }).getByText("容器验收学校")).toBeVisible()

  const screenshotPath = process.env["UAT_SCREENSHOT_PATH"]
  if (screenshotPath !== undefined) {
    await page.screenshot({ path: screenshotPath, fullPage: true })
  }
  expect(consoleErrors).toEqual([])
})
