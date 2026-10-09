export type InsuranceBatchStatus = "draft" | "blocked" | "submitted" | "insured" | "failed" | "change_pending"
export type InsurancePersonStatus = "ready" | "blocked" | "submitted" | "insured" | "failed" | "cancellation_requested"
export type InsuranceHandoffKind = "submitted" | "manual_success" | "manual_failure" | "policy_change" | "cancellation_change"
export type InsuranceExportKind = "preparation" | "company_template"

export type InsurancePlan = {
  readonly insurerName: string
  readonly planName: string
  readonly coverageSummary: string
  readonly notice: string | null
}

export type SessionInsurancePlan = {
  readonly tourSessionId: string
  readonly plan: InsurancePlan | null
}

export type InsuranceBatchPerson = {
  readonly id: string
  readonly personRef: string
  readonly displayName: string
  readonly className: string | null
  readonly identityMasked: string | null
  readonly phoneMasked: string | null
  readonly status: InsurancePersonStatus
  readonly issueCode: "missing_identity" | "traveler_conflict" | null
  readonly policyNumber: string | null
  readonly receiptReference: string | null
  readonly coverageStart: string | null
  readonly coverageEnd: string | null
}

export type InsuranceHandoff = {
  readonly id: string
  readonly kind: InsuranceHandoffKind
  readonly note: string
  readonly receiptReference: string | null
  readonly createdAt: string
}

export type InsuranceBatch = {
  readonly id: string
  readonly tourSessionId: string
  readonly organizationId: string
  readonly rosterVersion: string
  readonly status: InsuranceBatchStatus
  readonly companyTemplateName: string | null
  readonly planSnapshot: InsurancePlan | null
  readonly submittedAt: string | null
  readonly createdAt: string
  readonly people: readonly InsuranceBatchPerson[]
  readonly handoffs: readonly InsuranceHandoff[]
}

export type InsuranceDiff = {
  readonly rosterChanged: boolean
  readonly currentRosterVersion: string
  readonly addedRefs: readonly string[]
  readonly removedRefs: readonly string[]
  readonly changedRefs: readonly string[]
}

export type InsurancePreview = {
  readonly tourSessionId: string
  readonly organizationId: string
  readonly rosterVersion: string
  readonly activeCount: number
  readonly missingIdentityCount: number
  readonly conflictCount: number
}
