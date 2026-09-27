import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"

const api = "http://127.0.0.1:3000"
const permissions = ["evaluations.read", "evaluations.write", "evaluations.confirm", "evaluations.standard.write", "evaluations.standard.confirm", "evaluations.school_report"]
const standard = { id: "std-a", tourSessionId: "session-a", title: "学校提供标准", confirmedAt: "2026-09-27T00:00:00.000Z", version: 2, items: [{ code: "A", label: "学校A标签", description: "学校A规则" }, { code: "B", label: "学校B标签", description: "学校B规则" }] }
const student = { personRef: "paid:line-a", displayName: "学生甲", gradeName: "五年级", className: "一班" }
const row = { ...student, id: "eval-a", version: 1, standardId: "std-a", organizationId: "school-a", gradeCode: "A", gradeLabel: "学校A标签", internalComment: "内部观察", excellent: false, attention: false, confirmedAt: null }

test("batches selected students, revises one record and confirms grades", async ({ page }, testInfo) => {
  await installStaffAuthMock(page, permissions)
  let stage = 0
  await page.route(api + "/evaluations/staff/sessions/session-a", route => route.fulfill({ json: { organizationId: "school-a", standards: [standard], students: [student, { ...student, personRef: "paid:line-b", displayName: "学生乙" }], evaluations: stage === 0 ? [] : [{ ...row, version: stage, gradeCode: stage >= 2 ? "B" : "A", gradeLabel: stage >= 2 ? "学校B标签" : "学校A标签", confirmedAt: stage === 3 ? "2026-09-27T00:00:00.000Z" : null }] } }))
  await page.route(api + "/evaluations/staff/batch", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ standardId: "std-a", observations: [{ personRef: "paid:line-a", gradeCode: "A", internalComment: "内部观察" }] })
    stage = 1
    await route.fulfill({ json: [row] })
  })
  await page.route(api + "/evaluations/staff/eval-a", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ expectedVersion: 1, gradeCode: "B" })
    stage = 2
    await route.fulfill({ json: { ...row, version: 2, gradeCode: "B" } })
  })
  await page.route(api + "/evaluations/staff/sessions/session-a/confirm", async route => { stage = 3; await route.fulfill({ json: [] }) })
  page.on("dialog", dialog => dialog.accept())
  await page.goto("/evaluations")
  await page.getByLabel("团期 ID").fill("session-a")
  await page.getByRole("button", { name: "加载评价" }).click()
  await expect(page.getByRole("combobox", { name: "等级", exact: true })).toBeDisabled()
  await page.getByLabel("选择学生甲", { exact: true }).check()
  await page.getByRole("combobox", { name: "评价标准", exact: true }).selectOption("std-a")
  await page.getByRole("combobox", { name: "等级", exact: true }).selectOption("A")
  await page.getByLabel("内部观察", { exact: true }).fill("内部观察")
  await page.getByRole("button", { name: "保存所选学生评价" }).click()
  await expect(page.getByRole("status")).toContainText("已保存")
  await page.getByRole("button", { name: "修改", exact: true }).click()
  await page.getByRole("combobox", { name: "等级", exact: true }).selectOption("B")
  await page.getByRole("button", { name: "保存个别修改" }).click()
  await expect(page.locator("tbody tr").first()).toContainText("学校B标签")
  await page.getByRole("button", { name: "确认本团期已评级记录" }).click()
  await expect(page.locator("tbody tr").first()).toContainText("已确认")
  await expect(page.locator("tbody tr").nth(1)).toContainText("未评级")
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ fullPage: true, path: testInfo.outputPath(`evaluations-${width}.png`) })
  }
})

test("shows empty and failure states and hides write actions for read-only staff", async ({ page }) => {
  await installStaffAuthMock(page, ["evaluations.read"])
  await page.route(api + "/evaluations/staff/sessions/session-a", route => route.fulfill({ json: { organizationId: "school-a", standards: [], students: [], evaluations: [] } }))
  await page.goto("/evaluations")
  await page.getByLabel("团期 ID").fill("session-a")
  await page.getByRole("button", { name: "加载评价" }).click()
  await expect(page.getByText("暂无可评价学生")).toBeVisible()
  await expect(page.getByRole("button", { name: "保存所选学生评价" })).toHaveCount(0)
  await page.route(api + "/evaluations/staff/sessions/session-a", route => route.fulfill({ status: 403, json: { message: "无此团期权限" } }))
  await page.getByRole("button", { name: "加载评价" }).click()
  await expect(page.getByRole("alert")).toBeVisible()
})

test("requires explicit school rule inputs and confirmation for a standard", async ({ page }, testInfo) => {
  await installStaffAuthMock(page, permissions)
  const draft = { ...standard, confirmedAt: null, version: 1 }
  await page.route(api + "/evaluations/staff/sessions/session-a/standards", route => route.fulfill({ json: [draft] }))
  await page.route(api + "/evaluations/staff/standards/std-a/confirm", async route => {
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: 1, confirmed: true })
    await route.fulfill({ json: standard })
  })
  await page.goto("/evaluation-standards")
  await page.getByLabel("团期 ID").fill("session-a")
  await page.getByRole("button", { name: "加载标准" }).click()
  await expect(page.getByLabel("A 等级说明", { exact: true })).toHaveValue("")
  await expect(page.getByLabel("B 判定规则", { exact: true })).toHaveValue("")
  page.once("dialog", dialog => dialog.accept())
  await page.getByRole("button", { name: "确认此标准" }).click()
  await expect(page.getByText("标准已确认，可用于本团期评级。")).toBeVisible()
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ fullPage: true, path: testInfo.outputPath(`standards-${width}.png`) })
  }
})

test("school report-only staff can download without requesting internal evaluations", async ({ page }) => {
  await installStaffAuthMock(page, ["evaluations.school_report"])
  await page.route(api + "/staff/auth/me", route => route.fulfill({ json: { actorId: "school-staff", kind: "school", forcePasswordChange: false, permissionKeys: ["evaluations.school_report"], scopes: [{ kind: "school", id: "school-a" }] } }))
  const staffRequests: string[] = []
  page.on("request", request => { if (request.url().includes("/evaluations/staff/")) staffRequests.push(request.url()) })
  await page.route(api + "/evaluations/school/sessions/session-a?organizationId=school-a", route => route.fulfill({ json: [{ ...student, gradeCode: "A", gradeLabel: "学校A标签" }] }))
  await page.route(api + "/evaluations/school/sessions/session-a/report?organizationId=school-a&format=wordxml", route => route.fulfill({ contentType: "application/msword", body: '<?xml version="1.0"?><report>学生甲 A</report>' }))
  await page.goto("/evaluations")
  await expect(page.getByRole("link", { name: "学生评价" })).toBeVisible()
  await page.getByLabel("团期 ID").fill("session-a")
  await page.getByRole("button", { name: "加载评价" }).click()
  await expect(page.getByRole("heading", { name: "学校评价报告" })).toBeVisible()
  await expect(page.getByText("学校A标签", { exact: false })).toBeVisible()
  await expect(page.getByText("内部观察", { exact: true })).toHaveCount(0)
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出 Word XML" }).click()
  expect((await download).suggestedFilename()).toBe("学校评价报告.xml")
  expect(staffRequests).toEqual([])
})

test("standard confirmer can open and confirm a draft without writer or evaluation read access", async ({ page }) => {
  await installStaffAuthMock(page, ["evaluations.standard.confirm"])
  await page.route(api + "/evaluations/staff/sessions/session-a/standards", route => route.fulfill({ json: [{ ...standard, confirmedAt: null, version: 1 }] }))
  await page.route(api + "/evaluations/staff/standards/std-a/confirm", route => route.fulfill({ json: standard }))
  await page.goto("/evaluation-standards")
  await page.getByLabel("团期 ID").fill("session-a")
  await page.getByRole("button", { name: "加载标准" }).click()
  await expect(page.getByRole("button", { name: "保存标准草稿" })).toHaveCount(0)
  page.once("dialog", dialog => dialog.accept())
  await page.getByRole("button", { name: "确认此标准" }).click()
  await expect(page.getByText("标准已确认，可用于本团期评级。")).toBeVisible()
})
