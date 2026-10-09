import type { PersonRef } from "../travelers/travelers.types.js"
import type { ParticipantRefundStatus } from "../order/order.types.js"

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

export type FamilyInsuranceRecord = {
  readonly batchId: string
  readonly batchStatus: InsuranceBatchStatus
  readonly status: InsurancePersonStatus
  readonly planSnapshot: InsurancePlan | null
  readonly policyNumber: string | null
  readonly coverageStart: string | null
  readonly coverageEnd: string | null
  readonly createdAt: string
  readonly submittedAt: string | null
}

export type FamilyInsuranceResponse = {
  readonly orderId: string
  readonly tourSessionId: string
  readonly currentPlan: InsurancePlan | null
  readonly people: readonly {
    readonly orderLineId: string
    readonly displayName: string
    readonly refundStatus: ParticipantRefundStatus
    readonly records: readonly FamilyInsuranceRecord[]
  }[]
}

export type InsuranceBatchStatus = "draft" | "blocked" | "submitted" | "insured" | "failed" | "change_pending"
export type InsurancePersonStatus = "ready" | "blocked" | "submitted" | "insured" | "failed" | "cancellation_requested"
export type InsuranceIssueCode = "missing_identity" | "traveler_conflict" | null
export type InsuranceHandoffKind = "submitted" | "manual_success" | "manual_failure" | "policy_change" | "cancellation_change"
export type InsuranceExportKind = "preparation" | "company_template"

export type InsuranceBatchPerson = {
  readonly id: string
  readonly personRef: PersonRef
  readonly sourceRefs: readonly PersonRef[]
  readonly displayName: string
  readonly className: string | null
  readonly identityMasked: string | null
  readonly identityCiphertext: string | null
  readonly phoneMasked: string | null
  readonly phoneCiphertext: string | null
  readonly personDataKeyVersion: string
  readonly status: InsurancePersonStatus
  readonly issueCode: InsuranceIssueCode
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

export type InsuranceBatchSnapshot = {
  readonly id: string
  readonly tourSessionId: string
  readonly organizationId: string
  readonly rosterVersion: string
  readonly status: InsuranceBatchStatus
  readonly planSnapshot: InsurancePlan | null
  readonly companyTemplateName: string | null
  readonly submittedAt: string | null
  readonly createdAt: string
  readonly people: readonly InsuranceBatchPerson[]
  readonly handoffs: readonly InsuranceHandoff[]
}

export type InsuranceRosterDiff = {
  readonly rosterChanged: boolean
  readonly currentRosterVersion: string
  readonly addedRefs: readonly PersonRef[]
  readonly removedRefs: readonly PersonRef[]
  readonly changedRefs: readonly PersonRef[]
}

export type InsurancePreview = {
  readonly tourSessionId: string
  readonly organizationId: string
  readonly rosterVersion: string
  readonly activeCount: number
  readonly missingIdentityCount: number
  readonly conflictCount: number
}

export type InsuranceAccess = {
  readonly actorId?: string
  readonly permissionKeys: ReadonlySet<string>
  readonly scopes?: readonly { readonly kind: string; readonly id: string }[]
}
