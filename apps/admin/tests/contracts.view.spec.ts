import { createApp, nextTick } from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import ContractsView from "@/views/ContractsView.vue"
import OrderContractPanel from "@/views/OrderContractPanel.vue"

const source = { id: "source-1", kind: "staff_recuperation", title: "职工疗休养合同", sourceFilename: "疗休养合同.docx", sourceSha256: "a".repeat(64), bodyText: "第一条\n原件全文 <img src=x onerror=alert(1)>" }
const template = { ...source, id: "template-1", tourSessionId: "session-1", version: "1", bodySha256: "b".repeat(64), createdBy: "staff", createdAt: "2026-10-03T01:00:00Z" }
const signedContract = { id: "contract-1", orderId: "order-1", status: "parent_signed_pending_agency", template, order: { id: "order-1", code: "LA001", payerName: "张家长", amountFen: 60000, startsAt: "2026-10-04T00:00:00Z", endsAt: "2026-10-04T09:00:00Z" }, participants: [{ name: "张同学", kind: "student", identityMasked: "330***1234", amountFen: 60000 }], scopeStatement: "个人签字仅作阅读确认，单位和旅行社签章另行办理。", snapshotHash: "c".repeat(64), createdAt: "2026-10-03T01:00:00Z", signedAt: "2026-10-03T02:00:00Z", signerName: "张家长", phoneVerified: true, signature: { width: 300, height: 150, strokes: [[{ x: 10, y: 10 }, { x: 60, y: 70 }]] }, signatureHash: "d".repeat(64) }

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren() })

function installConfiguration(readOnly = false): { readonly writes: { readonly path: string; readonly payload: unknown }[] } {
  const writes: { readonly path: string; readonly payload: unknown }[] = []
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path.endsWith("/staff/auth/me")) return Response.json({ actorId: "staff", kind: "administrator", forcePasswordChange: false, scopes: [{ kind: "all", id: null }], permissionKeys: readOnly ? ["configuration.read"] : ["configuration.read", "configuration.write"] })
    if (path.endsWith("/tour-sessions")) return Response.json([{ id: "session-1", organizationId: "school-1", catalogItemId: "catalog-1", code: "秋季研学团", status: "published", priceFen: 60000, capacity: 30, startsAt: "2026-10-04T00:00:00Z", endsAt: "2026-10-04T09:00:00Z", enrollmentOpensAt: null, enrollmentClosesAt: null }])
    if (path.endsWith("/schools")) return Response.json([{ id: "school-1", name: "锦城第一小学", code: "JC1" }])
    if (path.endsWith("/catalog-items")) return Response.json([{ id: "catalog-1", organizationId: "school-1", title: "天目山自然观察", code: "TM1" }])
    if (path.endsWith("/sources")) return Response.json({ sources: [source] })
    if (init?.method === "POST" || init?.method === "PUT") {
      writes.push({ path, payload: JSON.parse(String(init.body)) })
      return Response.json(init.method === "POST" ? template : { activeTemplateId: template.id, versions: [template] })
    }
    return Response.json({ activeTemplateId: null, versions: readOnly ? [template] : [] })
  }))
  return { writes }
}
function mountConfiguration(): { readonly host: HTMLDivElement; readonly unmount: () => void } {
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(ContractsView)
  app.mount(host)
  return { host, unmount: () => app.unmount() }
}
function button(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
async function select(host: HTMLElement, index: number, value: string): Promise<void> {
  const field = host.querySelectorAll("select")[index]
  if (!field) throw new Error("Missing select")
  field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })); await nextTick()
}
async function openSession(host: HTMLElement): Promise<void> {
  await vi.waitFor(() => expect(host.textContent).toContain("秋季研学团"))
  await select(host, 0, "session-1")
  button(host, "读取合同").click()
  await vi.waitFor(() => expect(host.textContent).toContain("合同版本"))
}

describe("contract configuration view", () => {
  it("identifies the selected school and activity without requiring a session code", async () => {
    installConfiguration()
    const { host, unmount } = mountConfiguration()
    try {
      await openSession(host)
      expect(host.querySelector('option[value="session-1"]')?.textContent).toContain("锦城第一小学 · 天目山自然观察 · 2026/10/4")
      expect(host.querySelector(".contract-session-summary h3")?.textContent).toBe("锦城第一小学 · 天目山自然观察")
      expect(host.querySelector(".contract-session-summary")?.textContent).toContain("团期编码：秋季研学团")
    } finally { unmount() }
  })
  it("keeps the active and latest versions visible while preserving all 20 versions behind the editor", async () => {
    installConfiguration()
    const originalFetch = globalThis.fetch
    const versions = Array.from({ length: 20 }, (_, index) => ({ ...template, id: `version-${20 - index}`, version: String(20 - index), bodyText: `合同正文第${20 - index}版` }))
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => String(input).endsWith("/sessions/session-1") ? Response.json({ activeTemplateId: "version-3", versions }) : originalFetch(input, init)))
    const { host, unmount } = mountConfiguration()
    try {
      await openSession(host)
      const history = host.querySelector<HTMLDetailsElement>(".contract-history")
      const editor = host.querySelector('[aria-labelledby="contract-editor-title"]')
      expect(history?.open).toBe(false)
      expect(history?.querySelectorAll(".contract-version")).toHaveLength(18)
      expect(host.querySelectorAll(".contract-version")).toHaveLength(20)
      expect(history?.previousElementSibling).toBe(editor)
      expect([...host.querySelectorAll('[aria-labelledby="contract-history-title"] .contract-version')].map(row => row.textContent)).toEqual([expect.stringContaining("版本 3"), expect.stringContaining("版本 20")])
      history?.querySelector("summary")?.click(); await nextTick()
      if (!history) throw new Error("Missing history")
      button(history, "查看全文").click(); await nextTick()
      expect(host.querySelector(".contract-body")?.textContent).toBe("合同正文第19版")
      await select(host, 0, "")
      expect(host.querySelector(".contract-preview")).toBeNull()
      expect(host.querySelector(".contract-history")).toBeNull()
    } finally { unmount() }
  })
  it("keeps the draft available for retry after a failed save", async () => {
    // Given
    installConfiguration()
    const originalFetch = globalThis.fetch
    let failed = false
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && !failed) { failed = true; return Response.json({ message: "保存失败，请重试" }, { status: 503 }) }
      return originalFetch(input, init)
    }))
    const { host, unmount } = mountConfiguration()
    try {
      await openSession(host); await select(host, 1, source.id)
      button(host, "导入范本全文").click(); await nextTick()
      const version = host.querySelector<HTMLInputElement>('input[placeholder]')
      const check = host.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (!version || !check) throw new Error("Missing contract form")
      version.value = "1"; version.dispatchEvent(new Event("input", { bubbles: true })); await nextTick()
      check.click(); await nextTick()
      host.querySelector(".contract-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(host.textContent).toContain("保存失败，请重试"))
      expect(host.querySelector("textarea")?.value).toBe(source.bodyText)
      // When
      host.querySelector(".contract-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      // Then
      await vi.waitFor(() => expect(host.textContent).toContain("新版本已保存，尚未启用"))
    } finally { unmount() }
  })
  it("requires review and leaves a saved version inactive until staff explicitly enables it", async () => {
    // Given
    const { writes } = installConfiguration()
    const { host, unmount } = mountConfiguration()
    try {
      await openSession(host)
      await select(host, 1, source.id)
      button(host, "导入范本全文").click(); await nextTick()
      expect(host.textContent).toContain("个人签字仅作阅读确认，单位和旅行社签章另行办理")
      const version = host.querySelector<HTMLInputElement>('input[placeholder]')
      const check = host.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (!version || !check) throw new Error("Missing contract form")
      version.value = "1"; version.dispatchEvent(new Event("input", { bubbles: true })); await nextTick()
      expect(button(host, "保存新版本").disabled).toBe(true)
      check.click(); await nextTick()
      // When
      host.querySelector(".contract-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      // Then
      await vi.waitFor(() => expect(host.textContent).toContain("新版本已保存，尚未启用"))
      expect(writes).toEqual([{ path: expect.stringContaining("/versions"), payload: { sourceId: source.id, title: source.title, version: "1", bodyText: source.bodyText, reviewed: true } }])
      expect(host.querySelector("img")).toBeNull()
      expect(host.querySelector(".contract-body")?.textContent).toBe(source.bodyText)
      expect(host.querySelector(".contract-preview textarea")).toBeNull()
    } finally { unmount() }
  })
  it("allows only history reading when the account has configuration.read", async () => {
    // Given
    installConfiguration(true)
    const { host, unmount } = mountConfiguration()
    try {
      // When
      await openSession(host)
      button(host, "查看全文").click(); await nextTick()
      // Then
      expect(host.textContent).toContain(source.bodyText)
      expect([...host.querySelectorAll("button")].map(item => item.textContent?.trim())).not.toContain("保存新版本")
      expect([...host.querySelectorAll("button")].map(item => item.textContent?.trim())).not.toContain("启用此版本")
    } finally { unmount() }
  })
})

describe("order contract panel", () => {
  it("allows closing a pending read and keeps its late response hidden", async () => {
    // Given
    let finish: (response: Response) => void = () => undefined
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const host = document.createElement("div"); document.body.append(host)
    const app = createApp(OrderContractPanel, { orderId: "order-1" }); app.mount(host)
    try {
      button(host, "查看合同与签字").click(); await nextTick()
      expect(host.textContent).toContain("正在读取订单合同")
      // When
      button(host, "收起合同").click()
      finish(Response.json({ contract: signedContract }))
      await nextTick()
      // Then
      await vi.waitFor(() => expect(button(host, "查看合同与签字")).toBeDefined())
      expect(host.querySelector("article")).toBeNull()
      expect(host.textContent).not.toContain("张家长")
    } finally { app.unmount() }
  })
  it("retries a failed read and renders historical text and native signature without HTML execution", async () => {
    // Given
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ message: "读取失败，请重试" }, { status: 503 })).mockResolvedValueOnce(Response.json({ contract: signedContract }))
    vi.stubGlobal("fetch", fetcher)
    const host = document.createElement("div"); document.body.append(host)
    const app = createApp(OrderContractPanel, { orderId: "order-1" }); app.mount(host)
    try {
      button(host, "查看合同与签字").click()
      await vi.waitFor(() => expect(host.textContent).toContain("读取失败，请重试"))
      // When
      button(host, "重试").click()
      // Then
      await vi.waitFor(() => expect(host.textContent).toContain("家长已签字，待旅行社处理"))
      expect(host.textContent).toContain("10:00:00")
      expect(host.querySelector("polyline")?.getAttribute("points")).toBe("10,10 60,70")
      expect(host.querySelector("img")).toBeNull()
      expect(host.querySelector(".contract-body")?.textContent).toBe(source.bodyText)
      expect(host.querySelector("input, textarea")).toBeNull()
    } finally { app.unmount() }
  })
})
