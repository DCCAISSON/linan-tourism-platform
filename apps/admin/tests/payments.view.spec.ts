import { createApp, nextTick } from "vue"
import { afterEach, expect, it, vi } from "vitest"
import PaymentReconciliationView from "@/views/PaymentReconciliationView.vue"

const apps: ReturnType<typeof createApp>[] = []
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

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
