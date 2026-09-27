import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { dataSource } from "./catalog-trip-fixture.js"
import {
  createCatalog,
  createMember,
  enrollmentBody,
  resetEnrollmentConsentData,
  virtualPhone,
} from "./enrollment-consent-fixture.js"

export const LOCAL_MOCK_PROVIDER = "local_mock"

export type PaidEnrollmentFixture = {
  readonly headers: Record<string, string>
  readonly enrollmentId: string
  readonly tourSessionId: string
  readonly participantIds: readonly string[]
}

type PaidEnrollmentFixtureInput = {
  readonly app: INestApplication
  readonly scope: string
  readonly family: string
  readonly participantCount?: number
}

export async function createPaidEnrollmentFixture(
  input: PaidEnrollmentFixtureInput,
): Promise<PaidEnrollmentFixture> {
  const catalog = await createCatalog(input.app, input.scope)
  const headers = { "x-linan-dev-family-identity": `family-${input.scope}` }
  const memberIds: string[] = []
  for (let index = 0; index < (input.participantCount ?? 2); index += 1) {
    const member = await createMember({
      app: input.app,
      scope: input.scope,
      headers,
      catalog,
      displayName: `Payment Child ${String.fromCharCode(65 + index)}`,
      codeSuffix: `${index + 1}`,
    })
    memberIds.push(member.id)
  }
  const enrollment = await request(input.app.getHttpServer())
    .post("/enrollments")
    .set(headers)
    .send(enrollmentBody({
      catalog,
      memberIds,
      contactName: `Payment Parent ${input.family}`,
      emergencyContactName: `Payment Emergency ${input.family}`,
      emergencyContactPhone: virtualPhone("0008"),
    }))
    .expect(201)

  const participantRows = await dataSource.query(
    "select id from enrollment_participants where enrollment_id = ? order by id",
    [enrollment.body.id],
  )
  return {
    headers,
    enrollmentId: enrollment.body.id,
    tourSessionId: catalog.tourSessionId,
    participantIds: participantRows.map((row: { readonly id: string }) => row.id),
  }
}

export async function createOrder(
  app: INestApplication,
  fixture: PaidEnrollmentFixture,
  idempotencyKey: string,
): Promise<{ readonly id: string; readonly amountFen: number }> {
  const response = await request(app.getHttpServer())
    .post("/orders")
    .set(fixture.headers)
    .send({
      enrollmentId: fixture.enrollmentId,
      payerName: "Payment Parent",
      requestIdempotencyKey: idempotencyKey,
    })
    .expect(201)
  return { id: response.body.id, amountFen: response.body.amountFen }
}

export async function startMockPayment(
  app: INestApplication,
  fixture: PaidEnrollmentFixture,
  orderId: string,
): Promise<{ readonly id: string; readonly paymentNo: string; readonly amountFen: number }> {
  const response = await request(app.getHttpServer())
    .post(`/payments/mock/${orderId}`)
    .set(fixture.headers)
    .send({})
    .expect(201)
  return {
    id: response.body.id,
    paymentNo: response.body.paymentNo,
    amountFen: response.body.amountFen,
  }
}

export function mockEventBody(input: {
  readonly eventId: string
  readonly orderId: string
  readonly transactionId: string
  readonly amountFen: number
  readonly status: "succeeded" | "failed"
  readonly provider?: string
}) {
  return {
    eventId: input.eventId,
    orderId: input.orderId,
    transactionId: input.transactionId,
    amountFen: input.amountFen,
    status: input.status,
    provider: input.provider ?? LOCAL_MOCK_PROVIDER,
  }
}

export async function resetMockPaymentData(scope: string): Promise<void> {
  const familyPattern = `family-${scope}%`
  await dataSource.query(
    "delete pe from payment_events pe join payments p on p.id = pe.payment_id join orders o on o.id = p.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete r from roster_entries r join enrollments e on e.id = r.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete ol from order_lines ol join orders o on o.id = ol.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete p from payments p join orders o on o.id = p.order_id join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await dataSource.query(
    "delete o from orders o join enrollments e on e.id = o.enrollment_id join families f on f.id = e.family_id where f.code like ?",
    [familyPattern],
  )
  await resetEnrollmentConsentData(scope)
}
