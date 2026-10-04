import type { INestApplication } from "@nestjs/common"
import type request from "supertest"
import requestClient from "supertest"
import { dataSource, DEV_ADMIN_HEADERS } from "./catalog-trip-fixture.js"
import {
  type CatalogFixture,
  createMember,
  enrollmentBody,
  familyHeader,
  studentIdentityMemberBody,
  type VirtualIdentityFixture,
  virtualPhone,
} from "./enrollment-consent-fixture.js"
import {
  createOrder,
  mockEventBody,
  startMockPayment,
  type PaidEnrollmentFixture,
} from "./mock-payment-fixture.js"

export const ADMIN_HEADERS = DEV_ADMIN_HEADERS
export const ROSTER_COLUMNS = [
  "School",
  "Grade",
  "Class",
  "Participant",
  "Enrollment Code",
  "Order Code",
  "Amount Fen",
  "Roster Status",
] as const

type EnrollmentPaymentInput = {
  readonly app: INestApplication
  readonly scope: string
  readonly catalog: CatalogFixture
  readonly family: string
  readonly names: readonly string[]
  readonly status: "succeeded" | "failed"
  readonly identities?: readonly VirtualIdentityFixture[]
}

export async function payEnrollment(input: EnrollmentPaymentInput): Promise<string> {
  const fixture = await createEnrollment(input)
  const order = await createOrder(input.app, fixture, `order-${input.scope}-${input.family}`)
  const payment = await startMockPayment(input.app, fixture, order.id)
  await requestClient(input.app.getHttpServer())
    .post("/payments/mock/events")
    .set(fixture.headers)
    .send(mockEventBody({
      eventId: `event-${input.scope}-${input.family}`,
      orderId: order.id,
      transactionId: `transaction-${input.scope}-${input.family}`,
      amountFen: payment.amountFen,
      status: input.status,
    }))
    .expect(201)
  return order.id
}

export async function renamePaidParticipant(
  orderId: string,
  oldDisplayName: string,
  displayName: string,
): Promise<void> {
  const lines: readonly { readonly id: string; readonly enrollment_participant_id: string }[] = await dataSource.query(
    "select id, enrollment_participant_id from order_lines where order_id = ? and display_name_snapshot = ? limit 1",
    [orderId, oldDisplayName],
  )
  const firstLine = lines[0]
  if (firstLine === undefined) {
    return
  }
  await dataSource.query("update order_lines set display_name_snapshot = ? where id = ?", [displayName, firstLine.id])
  await dataSource.query("update roster_entries set display_name = ? where enrollment_participant_id = ?", [
    displayName,
    firstLine.enrollment_participant_id,
  ])
}

export function schoolStaffHeaders(schoolId: string): Record<string, string> {
  return {
    "x-linan-dev-staff-id": "dev-school",
    "x-linan-dev-staff-role": "school",
    "x-linan-dev-staff-school-id": schoolId,
  }
}

export function collectBinary(
  response: request.Response,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = []
  response.on("data", (chunk: unknown) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  })
  response.on("end", () => callback(null, Buffer.concat(chunks)))
  response.on("error", (error: Error) => callback(error, Buffer.alloc(0)))
}

async function createEnrollment(input: EnrollmentPaymentInput): Promise<PaidEnrollmentFixture> {
  const headers = familyHeader(input.scope, input.family)
  const memberIds: string[] = []
  for (const [index, name] of input.names.entries()) {
    const identity = input.identities?.[index]
    const memberInput = {
      app: input.app,
      scope: input.scope,
      headers,
      catalog: input.catalog,
      displayName: name,
      codeSuffix: `${input.family.slice(0, 1)}${index}`,
    }
    const member = await createMember(identity === undefined ? memberInput : {
      ...memberInput,
      body: studentIdentityMemberBody(
        input.catalog,
        name,
        `member-${input.scope}-${input.family.slice(0, 1)}${index}`,
        identity,
      ),
    })
    memberIds.push(member.id)
  }
  const enrollment = await requestClient(input.app.getHttpServer())
    .post("/enrollments")
    .set(headers)
    .send(enrollmentBody({
      catalog: input.catalog,
      memberIds,
      contactName: `Roster Parent ${input.family}`,
      emergencyContactName: `Roster Emergency ${input.family}`,
      emergencyContactPhone: virtualPhone("0009"),
    }))
    .expect(201)
  const participantRows: readonly { readonly id: string }[] = await dataSource.query(
    "select id from enrollment_participants where enrollment_id = ? order by id",
    [enrollment.body.id],
  )
  return {
    headers,
    enrollmentId: enrollment.body.id,
    tourSessionId: input.catalog.tourSessionId,
    participantIds: participantRows.map((row) => row.id),
  }
}
