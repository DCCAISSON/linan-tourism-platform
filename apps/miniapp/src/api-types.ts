import { DOMAIN_SCHEMA_VERSION, FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import type { TourSessionStatus } from "@linan/contracts"

export type School = {
  readonly id: string
  readonly code: string
  readonly name: string
}

export type Grade = {
  readonly id: string
  readonly organizationId: string
  readonly code: string
  readonly name: string
}

export type SchoolClass = {
  readonly id: string
  readonly gradeId: string
  readonly code: string
  readonly name: string
}

export type TourSession = {
  readonly id: string
  readonly organizationId: string
  readonly catalogItemId: string
  readonly code: string
  readonly status: TourSessionStatus
  readonly priceFen: number
  readonly capacity: number
  readonly startsAt: string
  readonly endsAt: string
  readonly enrollmentOpensAt: string
  readonly enrollmentClosesAt: string
  readonly policyVersion: string
}

export type EnrollmentPayload = {
  readonly tourSessionId: string
  readonly memberIds: readonly string[]
  readonly contactName: string
  readonly emergencyContactName: string
  readonly emergencyContactPhone: string
  readonly agreementVersion: typeof FAMILY_ENROLLMENT_AGREEMENT_VERSION
  readonly schemaVersion: typeof DOMAIN_SCHEMA_VERSION
}

export type EnrollmentMemberPayload = {
  readonly schoolId: string
  readonly gradeId: string
  readonly classId: string
  readonly code: string
  readonly displayName: string
}

export type EnrollmentMember = {
  readonly id: string
  readonly code: string
  readonly displayName: string
}

export type EnrollmentSubmission = {
  readonly id: string
  readonly status: string
}

export type EnrollmentAvailability = {
  readonly available: true
  readonly tourSessionId: string
  readonly at: string
}

export type MiniappRequestOptions = {
  readonly url: string
  readonly method: "GET" | "POST"
  readonly header: Record<string, string>
  readonly data?: object
}

export type MiniappRequestResult = {
  readonly data: unknown
  readonly statusCode: number
}

export type RequestTransport = (
  options: MiniappRequestOptions,
) => Promise<MiniappRequestResult>

export type MiniappApi = {
  readonly listSchools: () => Promise<readonly School[]>
  readonly listGrades: (schoolId: string) => Promise<readonly Grade[]>
  readonly listClasses: (gradeId: string) => Promise<readonly SchoolClass[]>
  readonly listTourSessions: () => Promise<readonly TourSession[]>
  readonly createEnrollmentMember: (
    payload: EnrollmentMemberPayload,
  ) => Promise<EnrollmentMember>
  readonly checkEnrollmentAvailability: (
    tourSessionId: string,
    atIso: string,
  ) => Promise<EnrollmentAvailability>
  readonly submitEnrollment: (
    payload: EnrollmentPayload,
  ) => Promise<EnrollmentSubmission>
}

export type MiniappApiOptions = {
  readonly baseUrl?: string
  readonly familyIdentityHeader?: string
  readonly request?: RequestTransport
}

export const FALLBACK_API_BASE_URL = "http://127.0.0.1:3000" as const
export const DEV_FAMILY_IDENTITY_HEADER = "x-linan-dev-family-identity" as const
export { FAMILY_ENROLLMENT_AGREEMENT_VERSION }
