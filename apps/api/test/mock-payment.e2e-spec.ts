import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase,
  createCatalogTripApp,
  createScope,
  dataSource,
  databaseUrl,
  initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import { familyHeader, restoreNodeEnv } from "./enrollment-consent-fixture.js"
import {
  createOrder,
  createPaidEnrollmentFixture,
  resetMockPaymentData,
} from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Order API", () => {
  let app: INestApplication
  let scope: string

  beforeAll(async () => {
    await initializeCatalogTripDatabase()
  })

  beforeEach(async () => {
    scope = createScope()
    app = await createCatalogTripApp()
  })

  afterEach(async () => {
    await app.close()
    await resetMockPaymentData(scope)
  })

  afterAll(async () => {
    await closeCatalogTripDatabase()
  })

  it("calculates a two-participant order from the stored session price and replays the same request", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "amount" })
    const body = {
      enrollmentId: fixture.enrollmentId,
      payerName: "Authoritative Parent",
      requestIdempotencyKey: `order-${scope}-amount`,
      amountFen: 1,
    }

    // When
    const first = await request(app.getHttpServer()).post("/orders").set(fixture.headers).send(body).expect(201)
    const replay = await request(app.getHttpServer()).post("/orders").set(fixture.headers).send(body).expect(201)

    // Then
    expect(first.body).toEqual(
      expect.objectContaining({
        enrollmentId: fixture.enrollmentId,
        payerName: "Authoritative Parent",
        status: "pending_payment",
        amountFen: 2400,
        paidFen: 0,
        participantCount: 2,
      }),
    )
    expect(replay.body.id).toBe(first.body.id)
    await expect(dataSource.query("select count(*) as count from orders where enrollment_id = ?", [fixture.enrollmentId]))
      .resolves.toEqual([{ count: "1" }])
    await expect(
      dataSource.query(
        "select enrollment_participant_id, amount_fen from order_lines where order_id = ? order by enrollment_participant_id",
        [first.body.id],
      ),
    ).resolves.toEqual(
      fixture.participantIds.map((participantId) => ({ enrollment_participant_id: participantId, amount_fen: 1200 })),
    )
  })

  it("rejects an idempotency key reused for a different enrollment", async () => {
    // Given
    const firstFixture = await createPaidEnrollmentFixture({ app, scope: `${scope}-a`, family: "same" })
    const secondFixture = await createPaidEnrollmentFixture({ app, scope: `${scope}-b`, family: "same" })
    const requestIdempotencyKey = `order-${scope}-conflict`
    await request(app.getHttpServer()).post("/orders").set(firstFixture.headers).send({
      enrollmentId: firstFixture.enrollmentId,
      payerName: "First Parent",
      requestIdempotencyKey,
    }).expect(201)

    // When
    const conflict = await request(app.getHttpServer()).post("/orders").set(secondFixture.headers).send({
      enrollmentId: secondFixture.enrollmentId,
      payerName: "Second Parent",
      requestIdempotencyKey,
    }).expect(409)

    // Then
    expect(conflict.body).toEqual(expect.objectContaining({ code: "idempotency_conflict" }))
  })

  it("keeps order reads and mock payment initiation inside the current family", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "owner" })
    const order = await request(app.getHttpServer()).post("/orders").set(fixture.headers).send({
      enrollmentId: fixture.enrollmentId,
      payerName: "Owning Parent",
      requestIdempotencyKey: `order-${scope}-owner`,
    }).expect(201)
    const otherFamily = familyHeader(scope, "other")

    // When
    const read = await request(app.getHttpServer()).get(`/orders/${order.body.id}`).set(otherFamily).expect(404)
    const payment = await request(app.getHttpServer())
      .post(`/payments/mock/${order.body.id}`)
      .set(otherFamily)
      .send({})
      .expect(404)

    // Then
    expect(read.body).toEqual(expect.objectContaining({ code: "not_found" }))
    expect(payment.body).toEqual(expect.objectContaining({ code: "not_found" }))
  })

  it("creates one pending payment when the same mock payment is started concurrently", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "concurrent" })
    const order = await createOrder(app, fixture, `order-${scope}-concurrent`)

    // When
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post(`/payments/mock/${order.id}`).set(fixture.headers).send({}).expect(201),
      request(app.getHttpServer()).post(`/payments/mock/${order.id}`).set(fixture.headers).send({}).expect(201),
    ])

    // Then
    expect(first.body).toEqual(
      expect.objectContaining({ orderId: order.id, provider: "local_mock", status: "pending", amountFen: 2400 }),
    )
    expect(second.body.id).toBe(first.body.id)
    await expect(dataSource.query("select count(*) as count from payments where order_id = ?", [order.id]))
      .resolves.toEqual([{ count: "1" }])
  })

  it("does not expose the mock provider in production mode", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "production" })
    const order = await request(app.getHttpServer()).post("/orders").set(fixture.headers).send({
      enrollmentId: fixture.enrollmentId,
      payerName: "Production Parent",
      requestIdempotencyKey: `order-${scope}-production`,
    }).expect(201)
    const previousNodeEnv = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "production"

    try {
      // When
      const response = await request(app.getHttpServer())
        .post(`/payments/mock/${order.body.id}`)
        .set(fixture.headers)
        .send({})
        .expect(404)

      // Then
      expect(response.body).toEqual(expect.objectContaining({ code: "mock_provider_unavailable" }))
    } finally {
      restoreNodeEnv(previousNodeEnv)
    }
  })
})
