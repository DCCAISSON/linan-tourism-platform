import { createApp, nextTick } from "vue"
import { afterEach, expect, it, vi } from "vitest"
import PaymentReconciliationView from "@/views/PaymentReconciliationView.vue"

const apps: ReturnType<typeof createApp>[] = []
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each([
  ["wechat_bill_not_available", "微信未生成该日账单，请在微信商户平台核实当日收款和退款；仅报名未付款不会产生支付账单。"],
  ["wechat_request_rejected", "微信支付请求被拒绝"],
])("clears the previous result before a new date fails with %s", async (code, message) => {
  // Given
  const previous = { billDate: "2026-10-02", contentHash: "previous-hash", differenceCount: 0, confirmedNote: null, differences: [] }
  const response = Promise.withResolvers<Response>()
  const request = vi.fn().mockResolvedValueOnce(Response.json(previous)).mockReturnValueOnce(response.promise)
  vi.stubGlobal("fetch", request)
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(PaymentReconciliationView)
  app.mount(host)
  apps.push(app)
  const date = host.querySelector('input[type="date"]')
  if (!(date instanceof HTMLInputElement)) throw new Error("bill date input missing")
  date.value = previous.billDate
  date.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  host.querySelector("button")?.click()
  await vi.waitFor(() => expect(host.textContent).toContain("0 条差异"))
  expect(host.querySelector(".reconciliation-confirm")).not.toBeNull()
  date.value = "2026-10-03"
  date.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  // When
  host.querySelector("button")?.click()
  await nextTick()
  // Then
  expect(host.querySelector("#reconcile-result-title")).toBeNull()
  expect(host.querySelector(".reconciliation-confirm")).toBeNull()
  expect(host.textContent).not.toContain("0 条差异")
  response.resolve(Response.json({ code, message }, { status: 502 }))
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toBe(message))
  expect(host.querySelector("#reconcile-result-title")).toBeNull()
  expect(host.querySelector(".reconciliation-confirm")).toBeNull()
  expect(host.textContent).not.toContain("previous-hash")
  expect(request.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ date: "2026-10-03" }))
})

it("renders separate refunds under one payment and preserves them when confirmation reorders rows", async () => {
  // Given
  const refund = { kind: "refund_mismatch", outTradeNo: "PAY-1", outRefundNo: "REF-1", wechatAmountFen: null, localAmountFen: null, wechatRefundFen: 0, localRefundFen: null, summary: "退款待核实" }
  const differences = [refund, { ...refund, outRefundNo: "REF-2", wechatRefundFen: 2500, localRefundFen: 2000 }, { ...refund, kind: "amount_mismatch", outTradeNo: "PAY-2", outRefundNo: null, wechatAmountFen: 1200, localAmountFen: 1000, wechatRefundFen: null, summary: "支付待核实" }]
  const result = { billDate: "2026-09-29", contentHash: "hash", differenceCount: 3, confirmedNote: null, differences }
  const request = vi.fn(async (_input: unknown, init?: RequestInit) => Response.json(init?.body === JSON.stringify({ note: "已核实" }) ? { ...result, confirmedNote: "已核实", differences: [...differences].reverse() } : result))
  vi.stubGlobal("fetch", request)
  const warning = vi.spyOn(console, "warn")
  const host = document.createElement("div")
  document.body.append(host)
  const app = createApp(PaymentReconciliationView)
  app.mount(host)
  apps.push(app)
  // When
  host.querySelector("button")?.click()
  await vi.waitFor(() => expect(host.querySelectorAll("tbody tr")).toHaveLength(3))
  // Then
  const rows = [...host.querySelectorAll("tbody tr")]
  expect(rows[0]?.textContent).toContain("退款不一致")
  expect(rows[0]?.querySelector('[data-label="商户退款单号"]')?.textContent).toBe("REF-1")
  expect(rows[0]?.querySelector('[data-label="微信退款金额"]')?.textContent).toBe("¥0.00")
  expect(rows[0]?.querySelector('[data-label="平台退款金额"]')?.textContent).toBe("-")
  expect(rows[1]?.textContent).toContain("REF-2")
  expect(rows[1]?.textContent).toContain("¥25.00")
  expect(rows[2]?.textContent).toContain("¥12.00")
  const note = host.querySelector('input[type="text"]')
  if (!(note instanceof HTMLInputElement)) throw new Error("confirmation input missing")
  note.value = "已核实"
  note.dispatchEvent(new Event("input", { bubbles: true }))
  await nextTick()
  host.querySelector<HTMLButtonElement>(".reconciliation-confirm button")?.click()
  await vi.waitFor(() => expect(host.textContent).toContain("确认说明：已核实"))
  expect([...host.querySelectorAll('[data-label="商户退款单号"]')].map(cell => cell.textContent)).toEqual(["-", "REF-2", "REF-1"])
  expect(warning).not.toHaveBeenCalled()
})
