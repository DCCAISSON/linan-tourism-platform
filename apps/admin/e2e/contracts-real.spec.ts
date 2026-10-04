import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { parseOrderContract } from "../src/api/contracts.parsers"

const evidence = resolve(process.cwd(), "../../.omo/evidence/interaction-contract-20261003/admin")
const apiBase = process.env["LINAN_CONTRACT_API"] ?? "http://127.0.0.1:3110"
const sessionId = process.env["LINAN_UAT_TOUR_SESSION_ID"] ?? ""
const orderId = process.env["LINAN_UAT_ORDER_ID"] ?? ""
const username = process.env["LINAN_ADMIN_USERNAME"] ?? ""
const password = process.env["LINAN_ADMIN_PASSWORD"] ?? ""

test.describe.configure({ mode: "serial" })
test.setTimeout(120_000)
test.use({ actionTimeout: 15_000 })

for (const width of [375, 768, 1280]) {
  test(`real contract version and signed order at ${width}px`, async ({ page }) => {
    test.skip(!username || !password || !sessionId || !orderId, "requires isolated contract API fixtures")
    await mkdir(evidence, { recursive: true })
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await login(page, username, password)
    const original = parseOrderContract(await (await page.request.get(`${apiBase}/contracts/staff/orders/${orderId}`)).json())
    expect(original?.status).toBe("parent_signed_pending_agency")
    await page.goto("/contracts")
    await page.getByRole("combobox", { name: "团期", exact: true }).selectOption(sessionId)
    await expect(page.getByRole("region", { name: "选择团期", exact: true })).toContainText("（北京时间）")
    await page.getByRole("button", { name: "读取合同", exact: true }).click()
    await expect(page.getByRole("heading", { name: "合同版本" })).toBeVisible()
    const version = `UI-${width}-${Date.now()}`
    await page.getByRole("combobox", { name: "原件范本", exact: true }).selectOption({ index: 1 })
    await page.getByRole("button", { name: "导入范本全文" }).click()
    const body = page.getByLabel("合同全文", { exact: true })
    const sourceText = await body.inputValue()
    expect(sourceText.length).toBeGreaterThan(500)
    await body.fill(`${sourceText}\n本团期补充约定：按所列行程和费用安排服务。`)
    await page.getByLabel("合同标题", { exact: true }).fill(`研学团期合同 ${width}`)
    await page.getByLabel("版本名称", { exact: true }).fill(version)
    await expect(page.getByRole("button", { name: "保存新版本", exact: true })).toBeDisabled()
    await page.getByLabel("我已核对本团期适用条款并补全正文").check()
    await body.focus()
    await page.getByRole("button", { name: "保存新版本", exact: true }).hover()
    await assertNoOverflow(page, width)
    await page.screenshot({ path: resolve(evidence, `editor-${width}.png`), fullPage: true })
    await page.getByRole("button", { name: "保存新版本", exact: true }).click()
    await expect(page.getByRole("status")).toContainText("新版本已保存，尚未启用")
    const firstVersion = page.locator(".contract-version").filter({ hasText: version }).filter({ hasNotText: `${version}-2` })
    await expect(firstVersion).not.toContainText("当前启用")
    await firstVersion.getByRole("button", { name: "启用此版本" }).click()
    await expect(firstVersion).toContainText("当前启用")
    await page.getByRole("button", { name: "收起全文" }).click()
    await page.getByRole("button", { name: "导入范本全文" }).click()
    await page.getByLabel("版本名称", { exact: true }).fill(`${version}-2`)
    await body.fill(`${sourceText}\n第二版团期约定。`)
    await page.getByLabel("我已核对本团期适用条款并补全正文").check()
    await page.getByRole("button", { name: "保存新版本", exact: true }).click()
    await expect(page.getByRole("status")).toContainText("新版本已保存")
    await page.locator(".contract-version").filter({ hasText: `${version}-2` }).getByRole("button", { name: "启用此版本" }).click()
    await expect(page.getByRole("status")).toContainText("此版本已启用")
    await page.locator(".contract-history > summary").click()
    await firstVersion.first().getByRole("button", { name: "查看全文" }).click()
    await expect(page.getByLabel("历史合同全文").locator("pre")).toContainText("本团期补充约定")
    await expect(page.getByLabel("历史合同全文").locator("textarea")).toHaveCount(0)
    await assertNoOverflow(page, width)
    await page.locator(".contract-preview h3").scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(evidence, `history-${width}.png`) })
    await page.goto("/orders")
    await page.getByLabel("订单号或付款人").fill(original?.order.code ?? "missing")
    await page.getByRole("button", { name: "查询订单", exact: true }).click()
    await page.getByRole("button", { name: "查看详情", exact: true }).first().click()
    await page.getByRole("button", { name: "查看合同与签字", exact: true }).click()
    await expect(page.getByLabel("订单合同快照")).toContainText("家长已签字，待旅行社处理")
    await expect(page.locator(".contract-signature polyline")).not.toHaveCount(0)
    await expect(page.getByLabel("订单合同快照").locator("pre")).toHaveText(original?.template.bodyText ?? "missing")
    await expect(page.getByLabel("订单合同快照").locator("textarea,input")).toHaveCount(0)
    await page.locator(".order-contract h3").scrollIntoViewIfNeeded()
    await assertNoOverflow(page, width)
    await page.screenshot({ path: resolve(evidence, `signed-order-${width}.png`) })
    expect(errors).toEqual([])
  })
}

test("real read-only permissions hide editing and signed personal data", async ({ page }) => {
  const reader = process.env["LINAN_READER_USERNAME"] ?? ""
  const readerPassword = process.env["LINAN_READER_PASSWORD"] ?? ""
  test.skip(!reader || !readerPassword, "requires contract read-only fixture")
  await login(page, reader, readerPassword)
  await page.goto("/contracts")
  await page.getByRole("combobox", { name: "团期", exact: true }).selectOption(sessionId)
  await page.getByRole("button", { name: "读取合同", exact: true }).click()
  await expect(page.getByRole("heading", { name: "合同版本" })).toBeVisible()
  await expect(page.getByRole("button", { name: "启用此版本" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "保存新版本", exact: true })).toHaveCount(0)
  await page.goto("/orders")
  await page.getByLabel("订单号或付款人").fill(await readOrderCode(page, orderId))
  await page.getByRole("button", { name: "查询订单", exact: true }).click()
  await page.getByRole("button", { name: "查看详情", exact: true }).first().click()
  await expect(page.getByRole("heading", { name: "参加人员" })).toBeVisible()
  await expect(page.getByRole("button", { name: "查看合同与签字", exact: true })).toHaveCount(0)
  expect((await page.request.get(`${apiBase}/contracts/staff/orders/${orderId}`)).status()).toBe(403)
  await page.screenshot({ path: resolve(evidence, "read-only-permissions.png"), fullPage: true })
})

test("real contract reader recovers after an injected connection failure", async ({ page }) => {
  test.skip(!username || !password || !orderId, "requires isolated contract API fixtures")
  await login(page, username, password)
  await page.goto("/orders")
  await page.getByLabel("订单号或付款人").fill(await readOrderCode(page, orderId))
  await page.getByRole("button", { name: "查询订单", exact: true }).click()
  await page.getByRole("button", { name: "查看详情", exact: true }).first().click()
  let releaseRead: () => void = () => undefined
  const waitForCapture = new Promise<void>(resolveRead => { releaseRead = resolveRead })
  await page.route(`${apiBase}/contracts/staff/orders/${orderId}`, async route => { await waitForCapture; await route.abort("failed") }, { times: 1 })
  await page.getByRole("button", { name: "查看合同与签字", exact: true }).click()
  try {
    await expect(page.locator(".order-contract [role=status]")).toContainText("正在读取订单合同")
    await expect(page.getByRole("button", { name: "收起合同", exact: true })).toBeEnabled()
    await page.screenshot({ path: resolve(evidence, "read-loading.png"), fullPage: true })
  } finally { releaseRead() }
  await expect(page.locator(".order-contract [role=alert]")).toContainText("无法连接服务器")
  await page.screenshot({ path: resolve(evidence, "read-error.png"), fullPage: true })
  await page.locator(".order-contract").getByRole("button", { name: "重试", exact: true }).click()
  await expect(page.getByLabel("订单合同快照")).toContainText("家长已签字，待旅行社处理")
})

test("real pending and historical orders retain their separate contract states", async ({ page }) => {
  const pendingId = process.env["LINAN_UAT_PENDING_ORDER_ID"] ?? ""
  const legacyId = process.env["LINAN_UAT_LEGACY_ORDER_ID"] ?? ""
  test.skip(!username || !password || !pendingId || !legacyId, "requires pending and legacy order fixtures")
  await login(page, username, password)
  for (const entry of [{ id: pendingId, expected: "待家长签字", image: "pending" }, { id: legacyId, expected: "此订单没有合同记录", image: "legacy" }]) {
    const code = await readOrderCode(page, entry.id)
    await page.goto("/orders")
    await page.getByLabel("订单号或付款人").fill(code)
    await page.getByRole("button", { name: "查询订单", exact: true }).click()
    await page.getByRole("button", { name: "查看详情", exact: true }).first().click()
    await page.getByRole("button", { name: "查看合同与签字", exact: true }).click()
    await expect(page.locator(".order-contract")).toContainText(entry.expected)
    await expect(page.locator(".contract-signature")).toHaveCount(0)
    await page.locator(".order-contract h3").scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(evidence, `order-${entry.image}.png`) })
  }
})

async function login(page: Page, account: string, secret: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("账号", { exact: true }).fill(account)
  await page.getByLabel("密码", { exact: true }).fill(secret)
  await page.getByRole("button", { name: "登录后台" }).click()
  await expect(page.getByRole("heading", { name: "研学出行服务台" })).toBeVisible()
}
async function assertNoOverflow(page: Page, width: number): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
}
async function readOrderCode(page: Page, id: string): Promise<string> {
  const order: unknown = await (await page.request.get(`${apiBase}/staff/orders/${id}`)).json()
  if (typeof order !== "object" || order === null) throw new Error("Order fixture response missing")
  const code = Object.fromEntries(Object.entries(order))["code"]
  if (typeof code !== "string") throw new Error("Order fixture code missing")
  return code
}
