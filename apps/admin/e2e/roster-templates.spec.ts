import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { installRosterOptions } from "./roster-options"
import { installStaffAuthMock } from "./staff-auth-mock"

const templates = [
  { type: "parent_child", name: "1-2年级亲子模板.xlsx", button: "下载1-2年级亲子模板" },
  { type: "grade_3_6", name: "3-6年级学生模板.xlsx", button: "下载3-6年级学生模板" },
  { type: "teacher", name: "教师名单模板.xlsx", button: "下载教师名单模板" },
] as const

test("downloads all original empty templates before selecting a tour session", async ({ page }, testInfo) => {
  await installStaffAuthMock(page)
  await installRosterOptions(page)
  for (const template of templates) {
    const buffer = await readFile(new URL(`../../api/src/modules/roster/templates/${template.type}.xlsx`, import.meta.url))
    await page.route(`http://127.0.0.1:3000/roster/templates/${template.type}.xlsx`, route => route.fulfill({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: buffer,
    }))
  }
  await page.goto("/roster")
  for (const template of templates) {
    const downloadEvent = page.waitForEvent("download")
    await page.getByRole("button", { name: template.button, exact: true }).click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe(template.name)
    const output = testInfo.outputPath(template.name)
    await download.saveAs(output)
    expect(await readFile(output)).toEqual(await readFile(new URL(`../../api/src/modules/roster/templates/${template.type}.xlsx`, import.meta.url)))
  }
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 960 })
    await page.screenshot({ path: testInfo.outputPath(`templates-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test("shows download errors and permits retry", async ({ page }) => {
  await installStaffAuthMock(page)
  await installRosterOptions(page)
  await page.route("http://127.0.0.1:3000/roster/templates/teacher.xlsx", route => route.fulfill({
    status: 503, json: { message: "模板暂不可用，请稍后重试" },
  }))
  await page.goto("/roster")
  await page.getByRole("button", { name: "下载教师名单模板", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("模板暂不可用，请稍后重试")
  await expect(page.getByRole("button", { name: "下载教师名单模板", exact: true })).toBeEnabled()
})

test("hides template downloads from staff without import permission", async ({ page }) => {
  await installStaffAuthMock(page, ["configuration.read", "roster.read", "roster.export"])
  await installRosterOptions(page)
  await page.goto("/roster")
  await expect(page.getByRole("heading", { name: "已支付名单与金额统计" })).toBeVisible()
  await expect(page.getByRole("button", { name: "下载教师名单模板", exact: true })).toHaveCount(0)
})
