import { DOMAIN_SCHEMA_VERSION, FAMILY_ENROLLMENT_AGREEMENT_VERSION } from "@linan/contracts"
import type { OrderStatus, PaymentStatus, TourSessionStatus } from "@linan/contracts"

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

export type SavedEnrollmentMember = EnrollmentMember & {
  readonly schoolId: string
  readonly gradeId: string | null
  readonly classId: string | null
}

export type CatalogItem = {
  readonly id: string
  readonly organizationId: string
  readonly code: string
  readonly title: string
  readonly status: string
  readonly policyVersion: string
  readonly description: string
  readonly coverImageUrl: string
}

export type OrderHistoryItem = Order & {
  readonly tourSessionId: string
  readonly activityTitle: string
  readonly schoolName: string
  readonly startsAt: string
  readonly endsAt: string
  readonly createdAt: string
}

export type OrderParticipant = {
  readonly id: string
  readonly enrollmentParticipantId: string
  readonly displayName: string
  readonly gradeName: string | null
  readonly className: string | null
  readonly amountFen: number
}

export type OrderDetail = OrderHistoryItem & {
  readonly contactName: string
  readonly emergencyContactName: string | null
  readonly emergencyContactPhone: string | null
  readonly participants: readonly OrderParticipant[]
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

export type CreateOrderPayload = {
  readonly enrollmentId: string
  readonly payerName: string
  readonly requestIdempotencyKey: string
}

export type Order = {
  readonly id: string
  readonly code: string
  readonly enrollmentId: string
  readonly status: OrderStatus
  readonly amountFen: number
  readonly paidFen: number
  readonly payerName: string
  readonly participantCount: number
}

export type MockPayment = {
  readonly id: string
  readonly orderId: string
  readonly paymentNo: string
  readonly provider: "local_mock"
  readonly status: PaymentStatus
  readonly amountFen: number
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
  readonly listCatalogItems: () => Promise<readonly CatalogItem[]>
  readonly listEnrollmentMembers: () => Promise<readonly SavedEnrollmentMember[]>
  readonly listOrders: () => Promise<readonly OrderHistoryItem[]>
  readonly getOrderDetail: (orderId: string) => Promise<OrderDetail>
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
  readonly createOrder: (payload: CreateOrderPayload) => Promise<Order>
  readonly getOrder: (orderId: string) => Promise<Order>
  readonly createMockPayment: (orderId: string) => Promise<MockPayment>
}

export type MiniappApiOptions = {
  readonly baseUrl?: string
  readonly familyIdentityHeader?: string
  readonly request?: RequestTransport
}

export const FALLBACK_API_BASE_URL = "http://127.0.0.1:3000" as const
export const DEV_FAMILY_IDENTITY_HEADER = "x-linan-dev-family-identity" as const
export { FAMILY_ENROLLMENT_AGREEMENT_VERSION }
