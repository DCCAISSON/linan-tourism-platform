export type ContractKind = "domestic_group_tour" | "staff_recuperation"
export type ContractSource = {
  readonly id: string
  readonly kind: ContractKind
  readonly title: string
  readonly sourceFilename: string
  readonly sourceSha256: string
  readonly bodyText: string
}
export type ContractTemplate = Omit<ContractSource, "id"> & {
  readonly id: string
  readonly tourSessionId: string
  readonly version: string
  readonly bodySha256: string
  readonly createdBy: string
  readonly createdAt: string
}
export type ContractSession = { readonly activeTemplateId: string | null; readonly versions: readonly ContractTemplate[] }
export type NewContractTemplate = { readonly sourceId: string; readonly version: string; readonly title: string; readonly bodyText: string; readonly reviewed: true }
export type ContractSignature = { readonly width: number; readonly height: number; readonly strokes: readonly (readonly { readonly x: number; readonly y: number }[])[] }
export type OrderContract = {
  readonly id: string
  readonly orderId: string
  readonly template: ContractTemplate
  readonly order: { readonly id: string; readonly code: string; readonly payerName: string; readonly amountFen: number; readonly startsAt: string; readonly endsAt: string }
  readonly participants: readonly { readonly name: string; readonly kind: "student" | "adult"; readonly identityMasked: string | null; readonly amountFen: number }[]
  readonly scopeStatement: string
  readonly status: "pending_parent_signature" | "parent_signed_pending_agency"
  readonly snapshotHash: string
  readonly createdAt: string
  readonly signedAt: string | null
  readonly signerName: string | null
  readonly phoneVerified: boolean
  readonly signature: ContractSignature | null
  readonly signatureHash: string | null
}
