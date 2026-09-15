import { FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"

export type EnrollmentIdentity = {
  readonly familyCode: string
  readonly actorId: string
}

export type NewFamilyMember = {
  readonly code: string
  readonly displayName: string
  readonly schoolId: string
  readonly gradeId: string
  readonly classId: string
}

export type UpdateFamilyMember = {
  readonly displayName: string | undefined
  readonly gradeId: string | undefined
  readonly classId: string | undefined
}

export type FamilyMemberResponse = {
  readonly id: string
  readonly code: string
  readonly displayName: string
  readonly schoolId: string
  readonly gradeId: string | null
  readonly classId: string | null
}

export type NewEnrollmentSubmission = {
  readonly tourSessionId: string
  readonly memberIds: readonly string[]
  readonly contactName: string
  readonly emergencyContactName: string
  readonly emergencyContactPhone: string
  readonly agreementVersion: typeof FAMILY_ENROLLMENT_AGREEMENT_VERSION
  readonly schemaVersion: string
}

export type EnrollmentSubmissionResponse = {
  readonly id: string
  readonly code: string
  readonly tourSessionId: string
  readonly familyId: string
  readonly memberIds: readonly string[]
  readonly participantCount: number
  readonly status: string
  readonly policyVersion: string
  readonly agreementVersion: string
  readonly schemaVersion: string
}
