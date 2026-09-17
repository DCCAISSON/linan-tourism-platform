import { expect, test } from "@playwright/test"
import { installRosterOptions } from "./roster-options"

const apiBase = "http://127.0.0.1:3000"

test("queries roster summary and downloads the export", async ({ page }) => {
  await installRosterOptions(page)
  await page.route(`${apiBase}/roster/summary?**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    expect(url.searchParams.get("tourSessionId")).toBe("session-1")
    expect(url.searchParams.get("schoolId")).toBe("school-1")
    expect(request.headers()["x-linan-dev-staff-id"]).toBe("dev-admin")
    expect(request.headers()["x-linan-dev-staff-role"]).toBe("administrator")
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
  await page.route(`${apiBase}/roster/export.xlsx?**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    expect(url.searchParams.get("tourSessionId")).toBe("session-1")
    expect(request.headers()["x-linan-dev-staff-role"]).toBe("administrator")
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
  await page.getByRole("button", { name: "查询名单" }).click()

  await expect(page.getByText("已支付人数")).toBeVisible()
  await expect(page.getByText("2 人")).toBeVisible()
  await expect(page.getByText("¥256.00")).toBeVisible()
  await expect(page.getByRole("cell", { name: "张三" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "二班" })).toBeVisible()

  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出 Excel" }).click()
  expect((await download).suggestedFilename()).toBe("名单统计-session-1.xlsx")
})

test("shows roster query errors", async ({ page }) => {
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
