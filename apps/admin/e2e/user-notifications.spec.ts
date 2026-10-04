import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"
const base = "http://127.0.0.1:3000/staff/user-notifications"
const template = { id: "template-activity", title: "新活动提醒", category: "activity", templateId: "wx-real-template", type: "once", enabled: true, fields: [{ key: "thing1", label: "活动名称", rule: "thing" }] }
const task = { id: "task-1", templateId: template.id, status: "pending", createdAt: "2026-09-30", payloadSnapshot: { title: "新活动提醒", templateId: template.templateId, page: "pages/activities/index", data: { thing1: { value: "秋日研学" } } } }
const detail = { task, targets: [{ id: "target-1", subscriptionId: "sub-1", status: "pending" }], attempts: [] }

test("creates without sending, preserves retry identity and confirms the selected snapshot", async ({ page }, testInfo) => {
  await installStaffAuthMock(page, ["notifications.read", "notifications.write", "notifications.send"])
  await page.route("**/staff/notifications/sessions", route => route.fulfill({ json: [] }))
  const bodies: unknown[] = []; const sends: string[] = []
  await page.route(base + "/templates", route => route.fulfill({ json: { templates: [template] } }))
  await page.route(base + "/preview", route => route.fulfill({ json: { subscribers: [{ id: "sub-1", version: 1 }], eligibleCount: 1 } }))
  await page.route(base + "/tasks", route => {
    if (route.request().method() === "POST") { bodies.push(route.request().postDataJSON()); return route.fulfill(bodies.length === 1 ? { status: 503, json: { message: "暂时无法创建，请重试" } } : { json: detail }) }
    return route.fulfill({ json: { tasks: [task, { ...task, id: "task-2" }] } })
  })
  await page.route(base + "/tasks/*", route => route.fulfill({ json: { ...detail, task: { ...task, id: route.request().url().split("/").at(-1) } } }))
  await page.route(base + "/tasks/*/send", route => { sends.push(route.request().url()); return route.fulfill({ json: { ...detail, task: { ...task, id: "task-2", status: "completed" }, targets: [{ ...detail.targets[0], status: "api_accepted" }] } }) })
  await page.goto("/notifications")
  await page.getByLabel("消息模板").selectOption(template.id)
  await page.getByLabel("活动名称").fill("秋日研学")
  await page.getByRole("button", { name: "预览可用订阅" }).click()
  await page.getByLabel("选择全部可用订阅").check()
  await page.getByRole("button", { name: "创建用户消息任务" }).click()
  await expect(page.getByRole("alert")).toContainText("暂时无法创建")
  await page.getByRole("button", { name: "创建用户消息任务" }).click()
  await expect(page.getByText("用户消息任务已创建，尚未发送。")).toBeVisible()
  expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]); expect(sends).toHaveLength(0)
  await page.getByRole("button", { name: "核对任务并准备发送" }).click()
  await expect(page.getByRole("button", { name: "确认发送此任务" })).toBeDisabled()
  await page.getByLabel("我已核对本任务内容和接收范围，确认实际发送").check()
  await page.getByRole("button").filter({ hasText: "task-2" }).click()
  await expect(page.getByRole("button", { name: "确认发送此任务" })).toHaveCount(0)
  await page.getByRole("button", { name: "核对任务并准备发送" }).click()
  await page.getByLabel("我已核对本任务内容和接收范围，确认实际发送").check()
  await page.getByRole("button", { name: "确认发送此任务" }).click()
  await expect(page.getByText("订阅编号 sub-1 · 接口已受理")).toBeVisible(); expect(sends).toEqual([base + "/tasks/task-2/send"])
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`user-messages-${width}.png`), fullPage: true })
  }
})

test("scoped staff see guidance without requesting global message endpoints", async ({ page }) => {
  await installStaffAuthMock(page, ["notifications.read"])
  await page.route("**/staff/auth/me", route => route.fulfill({ json: { actorId: "staff", kind: "staff", forcePasswordChange: false, permissionKeys: ["notifications.read"], scopes: [{ kind: "school", id: "school-1" }] } }))
  await page.route("**/staff/notifications/sessions", route => route.fulfill({ json: [] }))
  let calls = 0
  await page.route(base + "/**", route => { calls++; return route.fulfill({ status: 403, json: { message: "forbidden" } }) })
  await page.goto("/notifications")
  await expect(page.getByText("用户消息需要全局数据范围和通知查看权限。", { exact: false })).toBeVisible()
  expect(calls).toBe(0)
})

test("shows empty configuration and exposes response errors on refresh", async ({ page }) => {
  await installStaffAuthMock(page, ["notifications.read"])
  await page.route("**/staff/notifications/sessions", route => route.fulfill({ json: [] }))
  let malformed = false
  await page.route(base + "/templates", route => route.fulfill({ json: malformed ? {} : { templates: [] } }))
  await page.route(base + "/tasks", route => route.fulfill({ json: { tasks: [] } }))
  await page.goto("/notifications")
  await expect(page.getByText("尚未配置可用的微信订阅消息模板", { exact: false })).toBeVisible()
  await expect(page.getByText("暂无用户消息任务。", { exact: true })).toBeVisible()
  malformed = true
  await page.getByRole("button", { name: "刷新用户消息" }).click()
  await expect(page.getByRole("alert")).toHaveText("用户消息响应格式不正确，请刷新后重试。")
})
