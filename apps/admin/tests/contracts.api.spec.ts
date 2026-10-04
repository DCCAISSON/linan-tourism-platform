import { afterEach, describe, expect, it, vi } from "vitest"
import { getOrderContract, getSessionContracts, listContractSources, saveContractVersion, setActiveContract } from "@/api/contracts"

const template = { id: "template-1", tourSessionId: "session-1", version: "1", title: "研学出行合同", kind: "domestic_group_tour", bodyText: "第一条\n完整正文 <script>不执行</script>", sourceFilename: "境内游合同.docx", sourceSha256: "a".repeat(64), bodySha256: "b".repeat(64), createdBy: "staff", createdAt: "2026-10-03T01:00:00Z" }
const contract = { id: "contract-1", orderId: "order-1", status: "parent_signed_pending_agency", template, order: { id: "order-1", code: "LA001", payerName: "张家长", amountFen: 60000, startsAt: "2026-10-04T00:00:00Z", endsAt: "2026-10-04T09:00:00Z" }, participants: [{ name: "张同学", kind: "student", identityMasked: "330***1234", amountFen: 60000 }], scopeStatement: "个人阅读确认", snapshotHash: "c".repeat(64), createdAt: "2026-10-03T01:00:00Z", signedAt: "2026-10-03T02:00:00Z", signerName: "张家长", phoneVerified: true, signature: { width: 300, height: 150, strokes: [[{ x: 10, y: 10 }, { x: 60, y: 70 }]] }, signatureHash: "d".repeat(64) }

afterEach(() => vi.unstubAllGlobals())

describe("contract API boundary", () => {
  it("keeps the full text and signature coordinates when reading a signed order", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ contract })))
    // When
    const result = await getOrderContract("order-1")
    // Then
    expect(result).toEqual(contract)
  })
  it("rejects non-finite signature coordinates instead of rendering them", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ contract: { ...contract, signature: { width: 300, height: 150, strokes: [[{ x: null, y: 10 }]] } } })))
    // When / Then
    await expect(getOrderContract("order-1")).rejects.toThrow("合同响应格式不正确")
  })
  it("preserves an absent historical order contract", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ contract: null })))
    // When / Then
    await expect(getOrderContract("legacy")).resolves.toBeNull()
  })
  it("saves a reviewed version without implicitly activating it", async () => {
    // Given
    const fetcher = vi.fn(async () => Response.json(template))
    vi.stubGlobal("fetch", fetcher)
    const draft = { sourceId: "source-1", version: "1", title: "研学出行合同", bodyText: template.bodyText, reviewed: true } as const
    // When
    await saveContractVersion("session-1", draft)
    // Then
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("/contracts/staff/sessions/session-1/versions"), expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(draft) }))
  })
  it("uses separate read and activation requests", async () => {
    // Given
    const fetcher = vi.fn(async () => Response.json({ activeTemplateId: "template-1", versions: [template] }))
    vi.stubGlobal("fetch", fetcher)
    // When
    await getSessionContracts("session-1")
    await setActiveContract("session-1", "template-1")
    // Then
    expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining("/active"), expect.objectContaining({ method: "PUT", body: JSON.stringify({ templateId: "template-1" }) }))
  })
  it("returns source hashes without deriving them from editable text", async () => {
    // Given
    const source = { id: "source-1", kind: "domestic_group_tour", title: "境内游范本", sourceFilename: template.sourceFilename, sourceSha256: template.sourceSha256, bodyText: "原文" }
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ sources: [source] })))
    // When / Then
    await expect(listContractSources()).resolves.toEqual([source])
  })
})
