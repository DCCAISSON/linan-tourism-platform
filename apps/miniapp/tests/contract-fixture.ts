import type { ContractSignature, OrderContract } from "../src/contract-types"
export const handwriting: ContractSignature = { width: 1000, height: 600, strokes: [Array.from({ length: 20 }, (_, index) => ({ x: 30 + index * 20, y: 80 + index * 8 }))] }
export const pendingContract: OrderContract = {
  id: "contract-1", orderId: "order-1", status: "pending_parent_signature", snapshotHash: "snapshot-1", signingScope: "individual_reading_confirmation",
  template: { title: "团队境内旅游合同", version: "v1", kind: "domestic_group_tour", bodyText: "第一条 合同正文。\n第二条 安全须知。", bodySha256: "body-sha", sourceFilename: "团队境内旅游合同.docx", sourceSha256: "source-sha" },
  order: { id: "order-1", code: "ORDER-1", payerName: "李女士", amountFen: 12800, startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-11-02T00:00:00.000Z" },
  participants: [{ name: "学生甲", kind: "student", identityMasked: "110***********1234", amountFen: 12800 }],
  scopeStatement: "签字仅限本人阅读确认，未成年人由监护人办理。", signerName: null, signedAt: null, signature: null,
}
export const signedContract: OrderContract = { ...pendingContract, status: "parent_signed_pending_agency", signerName: "李女士", signedAt: "2026-10-03T12:00:00.000Z", signature: handwriting }
