import { expect, test } from "@playwright/test"
import type { PersonRef, TransportPeoplePlan, TransportPlan, TransportSuggestion, TransportTraveler } from "../src/api/transport.types"
import { installStaffAuthMock } from "./staff-auth-mock"

const apiBase = "http://127.0.0.1:3000"

test.setTimeout(60_000)

test("plans transport vehicles manually and exports the contact sheet", async ({ page }, testInfo) => {
  await installStaffAuthMock(page)
  await installOptions(page)
  let peoplePlan = emptyPeoplePlan()
  await page.route(`${apiBase}/transport/sessions/session-1/plan`, async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: emptyPlan() })
      return
    }
    const payload = await route.request().postDataJSON()
    expect(payload.vehicles[0].sequence).toBe(1)
    expect(payload.vehicles[0].allocations[0].classId).toBe("class-1")
    expect(payload.documentSnapshot).toMatchObject({ tripTitle: "地质研学", gatheringTime: "07:30", departureTime: "08:00", materialChecklist: "手牌、话筒" })
    peoplePlan = peoplePlanWithVehicle()
    await route.fulfill({ json: savedPlan() })
  })
  await page.route(`${apiBase}/transport/sessions/session-1/people-plan`, async route => {
    await route.fulfill({ json: peoplePlan })
  })
  await page.route(`${apiBase}/transport/sessions/session-1/person-allocations`, async route => {
    const payload = await route.request().postDataJSON()
    expect(payload).toMatchObject({ expectedPlanVersion: 2, expectedRosterVersion: "roster-v1" })
    peoplePlan = assignedPeoplePlan()
    await route.fulfill({ json: peoplePlan })
  })
  await page.route(`${apiBase}/transport/sessions/session-1/confirmations`, async route => {
    const payload = await route.request().postDataJSON()
    expect(payload).toMatchObject({ expectedPlanVersion: 3, expectedRosterVersion: "roster-v1" })
    peoplePlan = confirmedPeoplePlan()
    await route.fulfill({ status: 201, json: peoplePlan })
  })
  await page.route(`${apiBase}/transport/sessions/session-1/suggestions`, async route => {
    const payload = await route.request().postDataJSON()
    expect(payload).toMatchObject({ keepFamilyTogether: false, allowClassSplit: true })
    await route.fulfill({ json: draftSuggestion() })
  })
  await page.route(`${apiBase}/transport/sessions/session-1/export.xlsx`, async route => {
    await route.fulfill({ headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, body: "xlsx" })
  })

  await page.goto("/transport")
  await page.getByLabel("团期", { exact: true }).selectOption("session-1")
  await expect(page.getByLabel("学校/机构")).toHaveValue("school-1")
  await page.getByLabel("年级", { exact: true }).selectOption("grade-1")
  await page.getByLabel("班级").selectOption("class-1")
  await page.getByRole("button", { name: "读取安排" }).click()
  await page.getByLabel("研学行程名称", { exact: true }).fill("地质研学")
  await page.getByLabel("联系单集合时间", { exact: true }).fill("07:30")
  await page.getByLabel("出发时间", { exact: true }).fill("08:00")
  await page.getByLabel("物料准备", { exact: true }).fill("手牌、话筒")
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
  await expect(page.getByText("学生一")).toBeVisible()
  await page.locator('[aria-label="逐人车辆分配表"] select').selectOption("vehicle-1")
  await page.getByRole("button", { name: "保存逐人分配" }).click()
  await expect(page.getByText("实际 1/3")).toBeVisible()
  await page.getByRole("button", { name: "生成可调整草案" }).click()
  await expect(page.getByText("结果：可调整草案")).toBeVisible()
  await page.getByRole("button", { name: "确认当前安排" }).click()
  await expect(page.getByText("确认 有效")).toBeVisible()
  await expect(page.getByText("roster-v1")).toHaveCount(0)
  await expect(page.getByText("方案确认", { exact: true })).toBeVisible()

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
    "/catalog-items": [{ id: "catalog-1", title: "地质研学" }],
    "/schools": [{ id: "school-1", name: "临安实验小学", code: "school-1" }],
    "/tour-sessions": [{ id: "session-1", organizationId: "school-1", catalogItemId: "catalog-1", code: "2026-大明山演示", startsAt: "2026-05-09T00:00:00.000Z", endsAt: "2026-05-09T08:00:00.000Z", enrollmentOpensAt: "2026-04-01T00:00:00.000Z", enrollmentClosesAt: "2026-05-01T00:00:00.000Z", status: "published", priceFen: 19500, capacity: 500, activeNoticeId: null, activeNotice: null, policyVersion: "v1" }],
    "/schools/school-1/grades": [{ id: "grade-1", organizationId: "school-1", name: "一年级", code: "grade-1", status: "active" }],
    "/grades/grade-1/classes": [{ id: "class-1", gradeId: "grade-1", name: "一（1）班", code: "class-1", status: "active" }],
  }
  await Promise.all(Object.entries(collections).map(([path, json]) => page.route(`${apiBase}${path}`, route => route.fulfill({ json }))))
}

function emptyPlan(): TransportPlan {
  return { tourSessionId: "session-1", organizationId: "school-1", planVersion: 1, vehicles: [], totals: { studentCount: 0, guardianCount: 0, teacherCount: 0, otherCount: 0, occupancy: 0, seatCapacity: 0 }, warnings: ["样表合计488人与需求口径492人存在差异，本演示保留该差异，正式上线前请按最终名单核准。"] }
}

function savedPlan(): TransportPlan {
  return { ...emptyPlan(), planVersion: 2, vehicles: [savedVehicle()], totals: { studentCount: 1, guardianCount: 1, teacherCount: 1, otherCount: 0, occupancy: 3, seatCapacity: 3 } }
}

function savedVehicle() {
  return { id: "vehicle-1", sequence: 1, seatCapacity: 3, plateNumber: "浙A12345", contactSnapshot: { driverName: "驾驶员一", driverPhone: "19900000001", guideName: "", guidePhone: "", teacherName: "", teacherPhone: "" }, allocations: [{ id: "allocation-1", classId: "class-1", className: "一（1）班", gradeName: "一年级", studentCount: 1, guardianCount: 1, teacherCount: 1, otherCount: 0, note: "", occupancy: 3 }], occupancy: 3, remainingSeats: 0, warnings: [] }
}

function emptyPeoplePlan(): TransportPeoplePlan {
  return { tourSessionId: "session-1", organizationId: "school-1", planVersion: 1, rosterVersion: "roster-v1", vehicles: [], assignments: [], unassigned: [], conflicts: [], confirmation: null }
}

function peoplePlanWithVehicle(): TransportPeoplePlan {
  return { ...emptyPeoplePlan(), planVersion: 2, vehicles: [{ ...savedVehicle(), estimatedOccupancy: 3, actualOccupancy: 0, actualRemainingSeats: 3 }], unassigned: [teacher()] }
}

function assignedPeoplePlan(): TransportPeoplePlan {
  return { ...peoplePlanWithVehicle(), planVersion: 3, vehicles: [{ ...savedVehicle(), estimatedOccupancy: 3, actualOccupancy: 1, actualRemainingSeats: 2 }], assignments: [{ ...teacher(), vehicleId: "vehicle-1", conflict: null }], unassigned: [] }
}

function confirmedPeoplePlan(): TransportPeoplePlan {
  return { ...assignedPeoplePlan(), confirmation: { id: "confirmation-1", planVersion: 3, rosterVersion: "roster-v1", status: "current", confirmedAt: "2026-09-23T00:00:00.000Z", confirmedBy: "dev-admin" } }
}

function draftSuggestion(): TransportSuggestion {
  return {
    kind: "draft",
    assignments: [{ personRef: teacherPersonRef(), sequence: 1 }],
    explanations: ["1号车可用座位3，预留0，教师/导游占位0，实际可分配3。"],
    conflicts: [],
  }
}

function teacher(): TransportTraveler {
  return { personRef: teacherPersonRef(), displayName: "学生一", className: "一（1）班", importedRole: "teacher", active: true }
}

function teacherPersonRef(): PersonRef {
  return "imported:teacher-1"
}
