import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { describe, expect, it } from "vitest"
import type { MiniappRequestOptions, MiniappRequestResult, OrderParticipant } from "../src/api-types"
import { createExecutionHealthClient, type HealthAuthorization, type HealthDetailsPayload } from "../src/execution-health-api"

type Page = {
  orderId: string
  selectedPersonIndex: number
  readonly selectedParticipantLineId: string
  readonly form: { -readonly [Key in keyof HealthDetailsPayload]: HealthDetailsPayload[Key] }
  readonly authorization: HealthAuthorization | null
  readonly message: string
  readonly healthMessage?: string
  readonly load: () => Promise<void>
  readonly authorize: () => Promise<void>
  readonly revoke: () => Promise<void>
}

function setup() {
  let rows: readonly OrderParticipant[] = ["a", "b"].map((id) => ({
    id: `line-${id}`, displayName: `成员${id.toUpperCase()}`, participantKind: "adult", gradeName: null, className: null,
    enrollmentParticipantId: `enrollment-${id}`, familyMemberId: `member-${id}`, amountFen: 100, refundedFen: 0, refundStatus: "none",
  }))
  const requests: MiniappRequestOptions[] = []
  let hold = false
  let failRevoke = false
  let finish: () => void = () => { throw new Error("No request is waiting") }
  const client = createExecutionHealthClient({
    baseUrl: "https://health.example.test", wechatSessionToken: "synthetic-session",
    request: async (options): Promise<MiniappRequestResult> => {
      requests.push(options)
      if (options.url.endsWith("/public-summary")) return { statusCode: 200, data: { tourSessionId: "tour-fixture", personDailyReports: [], dailyReports: [], events: [] } }
      const revokeMatch = options.url.match(/health-authorizations\/(.+)\/revoke$/)
      if (revokeMatch && failRevoke) return { statusCode: 503, data: { message: "撤回暂未完成，请重试" } }
      const personRef = revokeMatch?.[1] ? decodeURIComponent(revokeMatch[1]) : options.data && "personRef" in options.data ? String(options.data.personRef) : ""
      const response = { statusCode: 200, data: { id: `auth-${personRef}`, tourSessionId: "tour-fixture", orderId: "order-fixture", personRef,
        active: !revokeMatch, version: 1, authorizedAt: "2026-10-04T00:00:00Z", revokedAt: revokeMatch ? "2026-10-04T01:00:00Z" : null } }
      if (!hold) return response
      hold = false
      return await new Promise((resolve) => { finish = () => resolve(response) })
    },
  })
  const { descriptor } = parse(readFileSync(new URL("../src/pages/health/index.vue", import.meta.url), "utf8"))
  const code = transpileModule(compileScript(descriptor, { id: "health-page" }).content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: { default?: { setup: (props: object, context: object) => Page } } = {}
  runInNewContext(code, { exports, Error, require: (name: string) => {
    if (name === "vue") return vue
    if (name === "@dcloudio/uni-app") return { onLoad: () => {} }
    if (name.endsWith("execution-health-api")) return { createExecutionHealthClient: () => client }
    if (name.endsWith("/api")) return { createMiniappApi: () => ({ getOrderDetail: async () => ({ participants: rows }) }) }
    throw new Error(`Unexpected import: ${name}`)
  } })
  if (!exports.default) throw new Error("Health SFC did not compile")
  const component = exports.default
  const scope = vue.effectScope()
  const page = scope.run(() => vue.proxyRefs(component.setup({}, { expose: () => {} })))
  if (!page) throw new Error("Health SFC did not initialize")
  page.orderId = "order-fixture"
  return { page, requests, stop: () => scope.stop(), holdNext: () => { hold = true }, finish: () => finish(),
    failRevoke: () => { failRevoke = true }, reverseRows: () => { rows = [...rows].reverse() } }
}

describe("health page participant ownership", () => {
  it("keeps A's draft out of B's submitted health details when changing participants", async () => {
    const fixture = setup()
    const { page, requests } = fixture
    try {
      await page.load()
      page.form.allergies = "A_ONLY"
      page.selectedPersonIndex = 1
      await vue.nextTick()

      await page.authorize()

      expect(requests.at(-1)?.data).toEqual({ personRef: "paid:line-b", allergies: "", medicalNotes: "", emergencyMedicine: "" })
      page.selectedPersonIndex = 0
      await vue.nextTick()
      expect(page.form.allergies).toBe("A_ONLY")
    } finally { fixture.stop() }
  })

  it("shows each participant's own authorization when switching from authorized A to B", async () => {
    const fixture = setup()
    const { page } = fixture
    try {
      await page.load()
      await page.authorize()

      page.selectedPersonIndex = 1
      await vue.nextTick()

      expect(page.authorization).toBeNull()
      page.selectedPersonIndex = 0
      await vue.nextTick()
      expect(page.authorization?.personRef).toBe("paid:line-a")
    } finally { fixture.stop() }
  })

  it("keeps an A save response and notice with A when B is selected before it returns", async () => {
    const fixture = setup()
    const { page, requests } = fixture
    try {
      await page.load()
      page.form.allergies = "A_ONLY"
      fixture.holdNext()
      const pending = page.authorize()
      page.selectedPersonIndex = 1
      await vue.nextTick()
      page.form.medicalNotes = "B_ONLY"

      fixture.finish()
      await pending

      expect(page.authorization).toBeNull()
      expect(page.healthMessage ?? page.message).toBe("")
      expect(page.form.allergies).toBe("")
      expect(page.form.medicalNotes).toBe("B_ONLY")
      expect(requests.at(-1)?.data).toEqual({ personRef: "paid:line-a", allergies: "A_ONLY", medicalNotes: "", emergencyMedicine: "" })
      page.selectedPersonIndex = 0
      await vue.nextTick()
      expect(page.authorization?.personRef).toBe("paid:line-a")
    } finally { fixture.stop() }
  })

  it("keeps the selected participant and their saved details when refreshing the order", async () => {
    const fixture = setup()
    const { page } = fixture
    try {
      await page.load()
      page.selectedPersonIndex = 1
      await vue.nextTick()
      page.form.emergencyMedicine = "B_ONLY"
      await page.authorize()

      await page.load()

      expect(page.selectedParticipantLineId).toBe("line-b")
      expect(page.form.emergencyMedicine).toBe("B_ONLY")
      expect(page.authorization?.personRef).toBe("paid:line-b")
    } finally { fixture.stop() }
  })

  it("keeps details with participant ID when a refresh changes the participant order", async () => {
    const fixture = setup()
    const { page } = fixture
    try {
      await page.load()
      page.form.medicalNotes = "A_ONLY"
      fixture.reverseRows()

      await page.load()

      expect(page.selectedParticipantLineId).toBe("line-a")
      expect(page.form.medicalNotes).toBe("A_ONLY")
    } finally { fixture.stop() }
  })

  it("retains A's active authorization when its revoke fails without showing it on B", async () => {
    const fixture = setup()
    const { page } = fixture
    try {
      await page.load()
      await page.authorize()
      fixture.failRevoke()

      await page.revoke()

      expect(page.authorization?.active).toBe(true)
      expect(page.healthMessage ?? page.message).toContain("撤回暂未完成")
      page.selectedPersonIndex = 1
      await vue.nextTick()
      expect(page.authorization).toBeNull()
      expect(page.healthMessage ?? page.message).toBe("")
    } finally { fixture.stop() }
  })

  it("does not start a duplicate save or conflicting revoke while A's save is pending", async () => {
    const fixture = setup()
    const { page, requests } = fixture
    try {
      await page.load()
      fixture.holdNext()
      const pending = page.authorize()

      await page.authorize()
      await page.revoke()

      expect(requests.filter((request) => request.method === "POST")).toHaveLength(1)
      fixture.finish()
      await pending
    } finally { fixture.stop() }
  })
})
