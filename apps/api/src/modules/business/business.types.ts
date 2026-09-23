export type BusinessCategory = "tourism" | "wellness" | "homestay"
export type BusinessStatus = "draft" | "published" | "archived"
export type InquiryStatus = "inquiry" | "processing" | "closed"
export type BusinessMedia = { readonly kind: "image" | "video"; readonly url: string }
export type ProductInput = {
  readonly organizationId: string; readonly category: BusinessCategory; readonly title: string
  readonly offering: string; readonly content: string; readonly referencePriceFen: number | null
  readonly customerServicePhone: string; readonly bookingUrl: string; readonly bookingAuthorized: boolean
  readonly media: readonly BusinessMedia[]; readonly mediaAuthorized: boolean; readonly status: BusinessStatus
}
export type InquiryInput = {
  readonly idempotencyKey: string; readonly customerType: "individual" | "organization"
  readonly organizationName: string; readonly contactName: string; readonly phone: string; readonly request: string
}
export type FollowupInput = {
  readonly idempotencyKey: string; readonly expectedVersion: number; readonly status: InquiryStatus
  readonly ownerStaffAccountId: string; readonly note: string
}
