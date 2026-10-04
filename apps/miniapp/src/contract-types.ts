export type ContractSignature = {
  readonly width: number
  readonly height: number
  readonly strokes: readonly (readonly { readonly x: number; readonly y: number }[])[]
}
export type OrderContract = {
  readonly id: string
  readonly orderId: string
  readonly status: "pending_parent_signature" | "parent_signed_pending_agency"
  readonly snapshotHash: string
  readonly signingScope: "individual_reading_confirmation"
  readonly template: {
    readonly title: string
    readonly version: string
    readonly kind: string
    readonly bodyText: string
    readonly bodySha256: string
    readonly sourceFilename: string
    readonly sourceSha256: string
  }
  readonly order: { readonly id: string; readonly code: string; readonly payerName: string; readonly amountFen: number; readonly startsAt: string; readonly endsAt: string }
  readonly participants: readonly { readonly name: string; readonly kind: "student" | "adult"; readonly identityMasked: string | null; readonly amountFen: number }[]
  readonly scopeStatement: string
  readonly signerName: string | null
  readonly signedAt: string | null
  readonly signature: ContractSignature | null
}
export type SignContractInput = { readonly snapshotHash: string; readonly signerName: string; readonly agreed: true; readonly signature: ContractSignature }
