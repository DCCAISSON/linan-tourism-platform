export type MarketingConsent = "unknown" | "granted" | "declined" | "withdrawn"
export type CrmMetadata = {
  readonly displayName: string
  readonly source: string
  readonly tags: readonly string[]
  readonly marketingConsent: MarketingConsent
  readonly ownerId: string | null
  readonly familyId: string | null
}
export type NewCrmCustomer = CrmMetadata & {
  readonly organizationId: string
  readonly birthDate: string
  readonly phone: string
  readonly adultConfirmed: true
  readonly idempotencyKey: string
}
export type CrmUpdate = CrmMetadata & { readonly expectedVersion: number }
export type CrmFollowupInput = {
  readonly content: string
  readonly nextFollowupAt: Date | null
  readonly idempotencyKey: string
}
export type CrmFilters = {
  readonly organizationId: string
  readonly keyword: string
  readonly tag: string
  readonly ownerId: string
  readonly marketingConsent: string
  readonly dueOnly: boolean
  readonly page: number
}
