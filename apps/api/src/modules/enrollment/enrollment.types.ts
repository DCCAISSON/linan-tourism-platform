import { FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import type { ParticipantKind, PlainPersonData, ProtectedPersonData } from "./person-data.js"

export type EnrollmentIdentity = {
  readonly familyCode: string
  readonly actorId: string
  readonly phoneVerified?: boolean
}

export type NewFamilyMember = {
  readonly code: string
  readonly displayName: string
  readonly participantKind: ParticipantKind
  readonly schoolId: string | undefined
  readonly gradeId: string | undefined
  readonly classId: string | undefined
  readonly tourSessionId: string | undefined
  readonly saveAsCommon?: boolean
  readonly personData: PlainPersonData | undefined
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
  readonly participantKind: ParticipantKind
  readonly schoolId: string
  readonly gradeId: string | null
  readonly classId: string | null
  readonly identityNumberMasked: string | null
  readonly phoneMasked: string | null
}

export type ProtectedFamilyMemberInput = Omit<NewFamilyMember, "schoolId" | "gradeId" | "classId"> & {
  readonly organizationId: string
  readonly gradeId: string | null
  readonly classId: string | null
  readonly protectedPersonData: ProtectedPersonData | undefined
}

export type NewEnrollmentSubmission = {
  readonly tourSessionId: string
  readonly memberIds: readonly string[]
  readonly contactName: string
  readonly contactPhone?: string
  readonly emergencyContactName: string
  readonly emergencyContactPhone: string
  readonly agreementVersion: typeof FAMILY_ENROLLMENT_AGREEMENT_VERSION
  readonly schemaVersion: string
  readonly noticeVersionId: string
  readonly noticeVersion: string
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
  readonly noticeVersionId: string
  readonly noticeVersion: string
}
