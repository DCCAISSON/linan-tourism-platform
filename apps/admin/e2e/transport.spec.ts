import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"

test("plans transport vehicles manually and exports the contact sheet", async ({ page }, testInfo) => {
  await installStaffAuthMock(page)
  await installOptions(page)
  await page.route(`${apiBase}/transport/sessions/session-1/plan`, async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: emptyPlan() })
      return
    }
    const payload = await route.request().postDataJSON()
    expect(payload.vehicles[0].sequence).toBe(1)
    expect(payload.vehicles[0].allocations[0].classId).toBe("class-1")
    await route.fulfill({ json: savedPlan() })
  })
  await page.route(`${apiBase}/transport/sessions/session-1/export.xlsx`, async route => {
    await route.fulfill({ headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, body: "xlsx" })
  })

  await page.goto("/transport")
  await page.getByLabel("团期").selectOption("session-1")
  await expect(page.getByLabel("学校/机构")).toHaveValue("school-1")
  await page.getByLabel("年级").selectOption("grade-1")
  await page.getByLabel("班级").selectOption("class-1")
  await page.getByRole("button", { name: "读取安排" }).click()
  await page.getByRole("button", { name: "新增车辆" }).click()
  await page.locator(".transport-vehicle input").nth(1).fill("3")
  await page.locator(".transport-vehicle input").nth(2).fill("浙A12345")
  await page.locator(".transport-vehicle input").nth(3).fill("驾驶员一")
  await page.locator(".transport-vehicle input").nth(4).fill("19900000001")
  await page.getByRole("button", { name: "添加班级" }).click()
  await page.locator(".transport-table select").selectOption("class-1")
  await page.locator(".transport-table input").nth(0).fill("1")
  await page.locator(".transport-table input").nth(1).fill("1")
  await page.locator(".transport-table input").nth(2).fill("1")
  await page.getByRole("button", { name: "保存安排" }).click()

  await expect(page.getByText("3 人", { exact: true })).toBeVisible()
  await expect(page.getByText("样表合计488人与需求口径492人存在差异")).toBeVisible()
  await expect(page.getByText("1 辆车", { exact: true })).toBeVisible()

  for (const size of [{ width: 1280, height: 900 }, { width: 768, height: 900 }, { width: 375, height: 900 }]) {
    await page.setViewportSize(size)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width)
    await page.screenshot({ path: testInfo.outputPath(`transport-${size.width}.png`), fullPage: true })
  }

  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出联系单" }).click()
  expect((await download).suggestedFilename()).toBe("车辆联系单-session-1.xlsx")
})

async function installOptions(page: Parameters<typeof installStaffAuthMock>[0]): Promise<void> {
  const collections = {
    "/schools": [{ id: "school-1", name: "临安实验小学", code: "school-1" }],
    "/tour-sessions": [{ id: "session-1", organizationId: "school-1", catalogItemId: "catalog-1", code: "2026-大明山演示", startsAt: "2026-05-09T00:00:00.000Z", endsAt: "2026-05-09T08:00:00.000Z", enrollmentOpensAt: "2026-04-01T00:00:00.000Z", enrollmentClosesAt: "2026-05-01T00:00:00.000Z", status: "published", priceFen: 19500, capacity: 500, activeNoticeId: null, activeNotice: null, policyVersion: "v1" }],
    "/schools/school-1/grades": [{ id: "grade-1", organizationId: "school-1", name: "一年级", code: "grade-1", status: "active" }],
    "/grades/grade-1/classes": [{ id: "class-1", gradeId: "grade-1", name: "一（1）班", code: "class-1", status: "active" }],
  }
  await Promise.all(Object.entries(collections).map(([path, json]) => page.route(`${apiBase}${path}`, route => route.fulfill({ json }))))
}

function emptyPlan() {
  return { tourSessionId: "session-1", organizationId: "school-1", vehicles: [], totals: { studentCount: 0, guardianCount: 0, teacherCount: 0, otherCount: 0, occupancy: 0, seatCapacity: 0 }, warnings: ["样表合计488人与需求口径492人存在差异，本演示保留该差异，正式上线前请按最终名单核准。"] }
}

function savedPlan() {
  return { tourSessionId: "session-1", organizationId: "school-1", vehicles: [{ id: "vehicle-1", sequence: 1, seatCapacity: 3, plateNumber: "浙A12345", contactSnapshot: { driverName: "驾驶员一", driverPhone: "19900000001", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" }, allocations: [{ id: "allocation-1", classId: "class-1", className: "一（1）班", gradeName: "一年级", studentCount: 1, guardianCount: 1, teacherCount: 1, otherCount: 0, note: "", occupancy: 3 }], occupancy: 3, remainingSeats: 0, warnings: [] }], totals: { studentCount: 1, guardianCount: 1, teacherCount: 1, otherCount: 0, occupancy: 3, seatCapacity: 3 }, warnings: ["样表合计488人与需求口径492人存在差异，本演示保留该差异，正式上线前请按最终名单核准。"] }
}
