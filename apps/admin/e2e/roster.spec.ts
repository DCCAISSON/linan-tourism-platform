import { expect, test } from "@playwright/test"
import { installRosterOptions } from "./roster-options"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"

test("queries roster summary, imports a returned template, and downloads the export", async ({ page }, testInfo) => {
  await installStaffAuthMock(page)
  await installRosterOptions(page)
  await page.route(`${apiBase}/roster/summary?**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    expect(url.searchParams.get("tourSessionId")).toBe("session-1")
    expect(url.searchParams.get("schoolId")).toBe("school-1")
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        filters: {
          tourSessionId: "session-1",
          schoolId: "school-1",
        },
        paidHeadcount: 2,
        paidAmountFen: 25600,
        rows: [
          {
            participantId: "participant-1",
            displayName: "张三",
            schoolId: "school-1",
            schoolName: "临安实验小学",
            gradeId: "grade-1",
            gradeName: "一年级",
            classId: "class-1",
            className: "一班",
            amountFen: 12800,
          },
          {
            participantId: "participant-2",
            displayName: "李四",
            schoolId: "school-1",
            schoolName: "临安实验小学",
            gradeId: "grade-1",
            gradeName: "一年级",
            classId: "class-2",
            className: "二班",
            amountFen: 12800,
          },
        ],
      }),
    })
  })
  await page.route(`${apiBase}/roster/imports`, async route => {
    expect(route.request().method()).toBe("POST")
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        id: "batch-1",
        sourceTemplate: "grade_3_6",
        tourSessionId: "session-1",
        schoolId: "school-1",
        gradeId: "grade-1",
        classId: "class-1",
        fileName: "3-6.xlsx",
        totalRows: 2,
        importedCount: 1,
        duplicateCount: 1,
        errorCount: 1,
        errors: [{ rowNumber: 4, role: "student", field: "identityNumber", message: "identityNumber must be a valid resident identity number" }],
      }),
    })
  })
  await page.route(`${apiBase}/roster/imports/batch-1/errors.csv`, async route => {
    await route.fulfill({ contentType: "text/csv; charset=utf-8", body: '"rowNumber","role","field","message"\r\n"4","student","identityNumber","bad"' })
  })
  await page.route(`${apiBase}/roster/export.xlsx?**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    expect(url.searchParams.get("tourSessionId")).toBe("session-1")
    await route.fulfill({
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      body: "xlsx",
    })
  })

  await page.goto("/roster")
  await expect(page.getByRole("button", { name: "查询名单" })).toBeDisabled()
  await expect(page.getByRole("button", { name: "导出 Excel" })).toBeDisabled()

  await page.getByLabel("团期", { exact: true }).selectOption("session-1")
  await page.getByLabel("学校", { exact: true }).selectOption("school-1")
  await page.getByLabel("年级", { exact: true }).selectOption("grade-1")
  await page.getByLabel("班级", { exact: true }).selectOption("class-1")
  await page.getByRole("button", { name: "查询名单" }).click()

  await expect(page.getByText("已支付人数")).toBeVisible()
  await expect(page.getByText("2 人")).toBeVisible()
  await expect(page.getByText("¥256.00")).toBeVisible()
  await expect(page.getByRole("cell", { name: "张三" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "二班" })).toBeVisible()

  await page.getByLabel("模板类型").selectOption("grade_3_6")
  await page.getByLabel("Excel 文件").setInputFiles({
    name: "3-6.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("xlsx"),
  })
  await page.getByRole("button", { name: "导入名单" }).click()
  await expect(page.getByText("已处理 2 行，新增 1 人，跳过重复 1 人，错误 1 条。")).toBeVisible()
  await expect(page.getByRole("table", { name: "名单导入错误表" })).toContainText("证件号码")
  await expect(page.getByRole("table", { name: "名单导入错误表" })).toContainText("证件号码格式不正确")
  await expect(page.getByRole("table", { name: "名单导入错误表" })).not.toContainText("identityNumber")
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`roster-import-${width}.png`), fullPage: true })
  }

  const errorDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "下载错误明细" }).click()
  expect((await errorDownload).suggestedFilename()).toMatch(/batch-1\.csv$/)

  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出 Excel" }).click()
  expect((await download).suggestedFilename()).toBe("名单统计-session-1.xlsx")
})

test("shows roster query errors", async ({ page }) => {
  await installStaffAuthMock(page)
  await installRosterOptions(page)
  await page.route(`${apiBase}/roster/summary?**`, async route => {
    await route.fulfill({
      contentType: "application/json",
      status: 500,
      body: JSON.stringify({ message: "名单服务暂不可用" }),
    })
  })

  await page.goto("/roster")
  await page.getByLabel("团期", { exact: true }).selectOption("session-2")
  await page.getByRole("button", { name: "查询名单" }).click()

  await expect(page.getByText("名单服务暂不可用")).toBeVisible()
  await expect(page.getByText("暂无名单数据，请调整筛选条件后查询。")).toBeHidden()
})

test("clears grade and class when the selected school changes", async ({ page }) => {
  // Given: name-based options belong to separate schools.
  await installStaffAuthMock(page)
  await installRosterOptions(page)
  await page.goto("/roster")
  await page.getByLabel("学校", { exact: true }).selectOption("school-1")
  await page.getByLabel("年级", { exact: true }).selectOption("grade-1")
  await page.getByLabel("班级", { exact: true }).selectOption("class-1")
  // When: the upstream school changes.
  await page.getByLabel("学校", { exact: true }).selectOption("school-2")
  // Then: incompatible downstream IDs cannot remain in the query.
  await expect(page.getByLabel("年级", { exact: true })).toHaveValue("")
  await expect(page.getByLabel("班级", { exact: true })).toHaveValue("")
  await expect(page.getByLabel("班级", { exact: true })).toBeDisabled()
})
