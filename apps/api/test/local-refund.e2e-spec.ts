import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource,
  databaseUrl, initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import { familyHeader, restoreNodeEnv } from "./enrollment-consent-fixture.js"
import {
  createOrder, createPaidEnrollmentFixture, mockEventBody, resetMockPaymentData, startMockPayment,
} from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Local participant refund validation", () => {
  let app: INestApplication
  let scope: string
  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => { scope = createScope(); app = await createCatalogTripApp() })
  afterEach(async () => { await app.close(); await resetMockPaymentData(scope) })
  afterAll(closeCatalogTripDatabase)

  async function fixtureFor(priceFen = 12800, pay = true) {
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "refund" })
    await dataSource.query("update tour_sessions set price_fen = ? where id = ?", [priceFen, fixture.tourSessionId])
    const order = await createOrder(app, fixture, `${scope}-refund`)
    if (pay) {
      await startMockPayment(app, fixture, order.id)
      await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(mockEventBody({
        eventId: `${scope}-paid`, orderId: order.id, transactionId: `${scope}-transaction`,
        amountFen: order.amountFen, status: "succeeded",
      })).expect(201)
    }
    const lines: { readonly id: string }[] = await dataSource.query("select id from order_lines where order_id = ? order by id", [order.id])
    return { ...fixture, orderId: order.id, lineIds: lines.map((line) => line.id) }
  }

  it.each([12800, 188000])("uses stored individual fees when cancelling one of two participants priced %i fen", async (price) => {
    // Given
    const fixture = await fixtureFor(price)
    // When
    const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-preview`)
      .set(fixture.headers).send({ lineIds: fixture.lineIds.slice(0, 1) }).expect(201)
    // Then
    expect(response.body).toEqual(expect.objectContaining({
      mode: "local_validation", settlementPerformed: false, amountFen: price, participantCount: 1,
      orderId: fixture.orderId,
    }))
  })

  it("returns the remaining paid order amount when all participants are selected", async () => {
    // Given
    const fixture = await fixtureFor()
    // When
    const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-preview`)
      .set(fixture.headers).send({ lineIds: fixture.lineIds }).expect(201)
    // Then
    expect(response.body.amountFen).toBe(25600)
  })

  it("uses the selected historical fee when isolated stored lines have different prices", async () => {
    // Given
    const fixture = await fixtureFor()
    await dataSource.query("update order_lines set amount_fen = ? where id = ?", [10800, fixture.lineIds[0]])
    await dataSource.query("update order_lines set amount_fen = ? where id = ?", [14800, fixture.lineIds[1]])
    // When
    const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-preview`)
      .set(fixture.headers).send({ lineIds: fixture.lineIds.slice(1) }).expect(201)
    // Then
    expect(response.body.amountFen).toBe(14800)
  })

  it.each([{ lineIds: [] }, { lineIds: ["unknown"] }, { lineIds: ["duplicate", "duplicate"] }])("rejects an invalid line selection $lineIds", async ({ lineIds }) => {
    // Given
    const fixture = await fixtureFor()
    // When
    const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-preview`)
      .set(fixture.headers).send({ lineIds }).expect(400)
    // Then
    expect(["malformed_input", "invalid_refund_selection"]).toContain(response.body.code)
  })

  it("rejects client monetary inputs when a stored line selection is valid", async () => {
    // Given
    const fixture = await fixtureFor()
    // When
    const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-preview`)
      .set(fixture.headers).send({ lineIds: fixture.lineIds, amountFen: 1, deductionFen: 1 }).expect(400)
    // Then
    expect(response.body.code).toBe("malformed_input")
  })

  it("rejects unpaid orders instead of deriving paid fees from their face value", async () => {
    // Given
    const fixture = await fixtureFor(12800, false)
    // When
    const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-preview`)
      .set(fixture.headers).send({ lineIds: fixture.lineIds }).expect(409)
    // Then
    expect(response.body.code).toBe("refund_payment_unverified")
  })

  it.each(["partial", "line-mismatch", "payment-mismatch"])("rejects inconsistent paid order %s", async (kind) => {
    // Given
    const fixture = await fixtureFor()
    if (kind === "partial") await dataSource.query("update orders set paid_fen = ? where id = ?", [12800, fixture.orderId])
    if (kind === "line-mismatch") await dataSource.query("update order_lines set amount_fen = ? where id = ?", [1, fixture.lineIds[0]])
    if (kind === "payment-mismatch") await dataSource.query("update payments set amount_fen = ? where order_id = ?", [1, fixture.orderId])
    // When
    const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-preview`)
      .set(fixture.headers).send({ lineIds: fixture.lineIds }).expect(409)
    // Then
    expect(response.body.code).toBe("refund_payment_unverified")
  })

  it("leaves money, order, enrollment and roster records unchanged when mock success and failure are repeated", async () => {
    // Given
    const fixture = await fixtureFor()
    const before = await snapshot(fixture.orderId, fixture.enrollmentId)
    // When
    for (const outcome of ["succeeded", "failed", "succeeded"] as const) {
      const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-simulation`)
        .set(fixture.headers).send({ lineIds: fixture.lineIds.slice(0, 1), outcome }).expect(201)
      expect(response.body).toEqual(expect.objectContaining({ outcome, settlementPerformed: false, amountFen: 12800 }))
    }
    // Then
    expect(await snapshot(fixture.orderId, fixture.enrollmentId)).toEqual(before)
  })

  it("denies other families and production access before revealing a quote", async () => {
    // Given
    const fixture = await fixtureFor()
    await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-preview`)
      .set(familyHeader(scope, "other")).send({ lineIds: fixture.lineIds }).expect(404)
    const previous = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "production"
    try {
      // When
      const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/refund-simulation`)
        .set(fixture.headers).send({ lineIds: fixture.lineIds, outcome: "succeeded" }).expect(404)
      // Then
      expect(response.body.code).toBe("local_refund_unavailable")
    } finally { restoreNodeEnv(previous) }
  })
})

async function snapshot(orderId: string, enrollmentId: string) {
  return Promise.all([
    dataSource.query("select * from orders where id = ?", [orderId]),
    dataSource.query("select * from order_lines where order_id = ? order by id", [orderId]),
    dataSource.query("select * from payments where order_id = ? order by id", [orderId]),
    dataSource.query("select pe.* from payment_events pe join payments p on p.id = pe.payment_id where p.order_id = ? order by pe.id", [orderId]),
    dataSource.query("select * from enrollments where id = ?", [enrollmentId]),
    dataSource.query("select * from roster_entries where enrollment_id = ? order by id", [enrollmentId]),
    dataSource.query("select * from refund_requests where order_id = ? order by id", [orderId]),
    dataSource.query("select l.* from refund_request_lines l join refund_requests r on r.id = l.refund_request_id where r.order_id = ? order by l.id", [orderId]),
  ])
}
