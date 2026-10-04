import { expect, test, type Locator, type Page } from "@playwright/test"

type RealUatConfig = {
  readonly username: string
  readonly password: string
  readonly tourSessionId: string
  readonly schoolId: string | null
  readonly gradeId: string | null
  readonly classId: string | null
}

type ViewportCase = {
  readonly name: string
  readonly width: number
  readonly height: number
}

const viewports: readonly ViewportCase[] = [
  { name: "mobile-375", width: 375, height: 900 },
  { name: "tablet-768", width: 768, height: 900 },
  { name: "desktop-1280", width: 1280, height: 900 },
]

for (const viewport of viewports) {
  test(`real admin journey without route mocks @${viewport.name}`, async ({ page }, testInfo) => {
    const config = readRealUatConfig()
    test.skip(config === null, "set LINAN_REAL_UAT=1 plus admin credentials and LINAN_UAT_TOUR_SESSION_ID to run against an already-started real admin/API stack")
    if (config === null) return

    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const surface = observeSurface(page)

    await login(page, config)
    await assertSurface(page, viewport.width, surface, "after login")

    await openTravelers(page, config)
    await assertSurface(page, viewport.width, surface, "travelers")

    await openTransport(page, config)
    await assertSurface(page, viewport.width, surface, "transport")

    await openPretrip(page, config)
    await assertSurface(page, viewport.width, surface, "pretrip")

    await openRefundApplications(page)
    await assertSurface(page, viewport.width, surface, "refund applications")

    await openNotifications(page, config)
    await assertSurface(page, viewport.width, surface, "notifications")

    await page.screenshot({ path: testInfo.outputPath(`real-surface-${viewport.name}.png`), fullPage: true })
  })
}

function readRealUatConfig(): RealUatConfig | null {
  if (process.env["LINAN_REAL_UAT"] !== "1") return null
  const username = process.env["LINAN_ADMIN_USERNAME"]
  const password = process.env["LINAN_ADMIN_PASSWORD"]
  const tourSessionId = process.env["LINAN_UAT_TOUR_SESSION_ID"]
  if (username === undefined || password === undefined || tourSessionId === undefined) return null
  return {
    username,
    password,
    tourSessionId,
    schoolId: process.env["LINAN_UAT_SCHOOL_ID"] ?? null,
    gradeId: process.env["LINAN_UAT_GRADE_ID"] ?? null,
    classId: process.env["LINAN_UAT_CLASS_ID"] ?? null,
  }
}

function observeSurface(page: Page): readonly string[] {
  const failures: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console error: ${message.text()}`)
  })
  page.on("pageerror", (error) => failures.push(`page error: ${error.message}`))
  return failures
}

async function login(page: Page, config: RealUatConfig): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("账号").fill(config.username)
  await page.getByLabel("密码").fill(config.password)
  await page.getByRole("button", { name: "登录后台" }).click()
  await expect(page.getByRole("heading", { name: "研学出行服务台" })).toBeVisible()
}

async function openTravelers(page: Page, config: RealUatConfig): Promise<void> {
  await page.getByRole("link", { name: "出行人员" }).click()
  await expect(page.getByRole("heading", { name: "来源、资格与冲突核对" })).toBeVisible()
  await page.getByLabel("团期").selectOption(config.tourSessionId)
  await selectConfiguredOrFirst(page.getByLabel("学校"), config.schoolId, "学校")
  if (config.gradeId !== null) await page.getByLabel("年级", { exact: true }).selectOption(config.gradeId)
  if (config.classId !== null) await page.getByLabel("班级").selectOption(config.classId)
  await page.getByRole("button", { name: "查询出行名单" }).click()
  await expect(page.locator(".roster-table-card")).toContainText(/出行人员|暂无人员|共/u)
}

async function openTransport(page: Page, config: RealUatConfig): Promise<void> {
  await page.getByRole("link", { name: "车辆安排" }).click()
  await expect(page.getByRole("heading", { name: "手工车辆分配与联系单导出" })).toBeVisible()
  await page.getByLabel("团期").selectOption(config.tourSessionId)
  await selectConfiguredOrFirst(page.getByLabel("学校/机构"), config.schoolId, "学校/机构")
  if (config.gradeId !== null) await page.getByLabel("年级", { exact: true }).selectOption(config.gradeId)
  if (config.classId !== null) await page.getByLabel("班级").selectOption(config.classId)
  await page.getByRole("button", { name: "读取安排" }).click()
  await expect(page.getByText("车辆计划版本")).toBeVisible()
  await expect(page.getByRole("heading", { name: "逐人分配与确认快照" })).toBeVisible()
}

async function openPretrip(page: Page, config: RealUatConfig): Promise<void> {
  await page.getByRole("link", { name: "行前配置" }).click()
  await expect(page.getByRole("heading", { name: "行前配置" })).toBeVisible()
  await page.getByLabel("团期").selectOption(config.tourSessionId)
  await page.getByRole("button", { name: "读取配置" }).click()
  await expect(page.getByText("配置已读取")).toBeVisible()
  await expect(page.getByRole("heading", { name: "学校签认状态" })).toBeVisible()
}

async function openRefundApplications(page: Page): Promise<void> {
  await page.getByRole("link", { name: "退款申请" }).click()
  await expect(page.getByRole("heading", { name: "退款申请" })).toBeVisible()
  await expect(page.getByText(/其中待审核 \d+ 笔/u)).toBeVisible()
  await expect(page.getByText(/当前筛选：\d+ 笔/u)).toBeVisible()
}

async function openNotifications(page: Page, config: RealUatConfig): Promise<void> {
  await page.getByRole("link", { name: "通知管理" }).click()
  await expect(page.getByRole("heading", { name: "通知内容、接收人和发送记录" })).toBeVisible()
  await page.getByRole("combobox", { name: "团期", exact: true }).selectOption(config.tourSessionId)
  await page.getByRole("button", { name: "读取团期通知" }).click()
  await expect(page.getByText("团期通知已读取。")).toBeVisible()
  await expect(page.getByRole("heading", { name: "内容版本" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "受控 HTTPS 入口" })).toBeVisible()
}

async function selectConfiguredOrFirst(select: Locator, configuredValue: string | null, fieldName: string): Promise<void> {
  if (configuredValue !== null) {
    await select.selectOption(configuredValue)
    return
  }
  const firstValue = await select.locator("option").evaluateAll((options) => {
    const option = options.find((item) => item instanceof HTMLOptionElement && item.value.trim().length > 0)
    return option instanceof HTMLOptionElement ? option.value : null
  })
  expect(firstValue, `${fieldName} must have at least one selectable option`).not.toBeNull()
  if (firstValue !== null) await select.selectOption(firstValue)
}

async function assertSurface(page: Page, viewportWidth: number, failures: readonly string[], label: string): Promise<void> {
  await expect(page.locator("[role='alert']")).toHaveCount(0)
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
  }))
  expect(layout.scrollWidth, `${label} should not overflow horizontally at ${viewportWidth}px; ${layout.offenders.join(", ")}`).toBeLessThanOrEqual(viewportWidth)
  expect(failures, `${label} should not emit console/page errors`).toEqual([])
}
