import { expect, test } from "@playwright/test"
import { installStaffAuthMock } from "./staff-auth-mock"
import type { UserMessageDetail } from "../src/api/user-notifications"
const base = "http://127.0.0.1:3000/staff/user-notifications"
const template = { id: "template-activity", title: "新活动提醒", category: "activity", templateId: "wx-real-template", type: "once", enabled: true, fields: [{ key: "thing1", label: "活动名称", rule: "thing" }] }
const task = { id: "task-1", templateId: template.id, status: "pending", createdAt: "2026-09-30", payloadSnapshot: { title: "新活动提醒", templateId: template.templateId, page: "pages/activities/index", data: { thing1: { value: "秋日研学" } } } }
const detail = { task, targets: [{ id: "target-1", subscriptionId: "sub-1", status: "pending" }], attempts: [] }

test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", route => new URL(route.request().url()).origin === new URL(baseURL ?? "http://127.0.0.1:5174").origin ? route.continue() : route.abort())
})

test("explains accepted, refused, unknown and invalid message attempts without offering resend", async ({ page }, testInfo) => {
  // Given
  await installStaffAuthMock(page, ["notifications.read", "notifications.send"])
  await page.route("**/staff/notifications/sessions", route => route.fulfill({ json: [] }))
  const attempts: UserMessageDetail["attempts"] = [
    { id: "attempt-1", targetId: "target-1", status: "api_accepted", errorCode: null },
    { id: "attempt-2", targetId: "target-2", status: "rejected", errorCode: "43101" },
    { id: "attempt-3", targetId: "target-3", status: "rejected", errorCode: "45009" },
    { id: "attempt-4", targetId: "target-4", status: "unknown", errorCode: "wechat_transport_unknown" },
    { id: "attempt-5", targetId: "target-5", status: "blocked", errorCode: "subscription_unavailable" },
    { id: "attempt-6", targetId: "target-6", status: "unknown", errorCode: "40003" },
    { id: "attempt-7", targetId: "target-7", status: "unknown", errorCode: "40037" },
    { id: "attempt-8", targetId: "target-8", status: "unknown", errorCode: "47003" },
  ]
  const completedTask = { ...task, status: "manual_required" }
  const targets = attempts.map(attempt => ({ id: attempt.targetId, subscriptionId: `sub-${attempt.id}`, status: attempt.status }))
  const sends: string[] = []
  await page.route(base + "/templates", route => route.fulfill({ json: { templates: [template] } }))
  await page.route(base + "/tasks", route => route.fulfill({ json: { tasks: [completedTask] } }))
  await page.route(base + "/tasks/task-1", route => route.fulfill({ json: { task: completedTask, targets, attempts } }))
  await page.route(base + "/tasks/*/send", route => { sends.push(route.request().url()); return route.abort() })
  await page.goto("/notifications")
  // When
  await page.getByRole("button").filter({ hasText: "task-1" }).click()
  // Then
  await expect(page.getByRole("heading", { name: "用户消息任务 task-1", exact: true })).toBeVisible()
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`attempt-guidance-${width}.png`), fullPage: true })
  }
  const panel = page.getByRole("region", { name: "用户消息 · 新活动提醒" })
  const guidance = [
    "微信接口已受理，请以本人手机实际收到为准。",
    "未订阅或无可用订阅次数，请本人重新同意订阅后再安排发送。",
    "发送次数受限，请稍后核对可用订阅次数后处理。",
    "发送结果尚未确认，请人工核对，不要直接重复发送。",
    "当前订阅授权或模板已不可用，本次未发送；请重新核对当前授权和模板。",
    "接收人标识无效，请联系管理员核对该用户的小程序身份。",
    "消息模板无效，请联系管理员核对模板是否属于当前小程序。",
    "消息内容不符合模板要求，请核对字段类型、长度和格式。",
  ]
  for (const [index, attempt] of attempts.entries()) {
    const row = panel.locator("p").filter({ hasText: `${attempt.targetId} ·` })
    await expect(row).toContainText(guidance[index] ?? "missing guidance")
    if (attempt.errorCode !== null) await expect(row).toContainText(`（${attempt.errorCode}）`)
  }
  await expect(panel.getByText("“接口已受理”不代表送达或已读。结果未知的目标不会自动重发。", { exact: true })).toBeVisible()
  await expect(panel.getByRole("button", { name: /重发|确认发送|准备发送/ })).toHaveCount(0)
  expect(sends).toEqual([])
})

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
