import { ORDER_STATUS } from "@linan/contracts"
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
import {
  createOrder,
  createPaidEnrollmentFixture,
  mockEventBody,
  resetMockPaymentData,
  startMockPayment,
} from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Mock payment events", () => {
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

  it("pays a two-participant enrollment once when the same success event is replayed", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "success" })
    const order = await createOrder(app, fixture, `order-${scope}-success`)
    await startMockPayment(app, fixture, order.id)
    const event = mockEventBody({
      eventId: `event-${scope}-success`,
      orderId: order.id,
      transactionId: `transaction-${scope}-success`,
      amountFen: order.amountFen,
      status: "succeeded",
    })

    // When
    const first = await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(event).expect(201)
    const replay = await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(event).expect(201)

    // Then
    expect(first.body).toEqual(expect.objectContaining({ orderId: order.id, status: "succeeded", amountFen: 2400 }))
    expect(replay.body).toEqual(first.body)
    await expect(
      dataSource.query("select status, paid_fen from orders where id = ?", [order.id]),
    ).resolves.toEqual([{ status: "paid", paid_fen: 2400 }])
    await expect(
      dataSource.query("select status from enrollments where id = ?", [fixture.enrollmentId]),
    ).resolves.toEqual([{ status: "confirmed" }])
    await expect(
      dataSource.query("select count(*) as count from payment_events where provider_event_id = ?", [event.eventId]),
    ).resolves.toEqual([{ count: "1" }])
    await expect(
      dataSource.query("select count(*) as count from roster_entries where enrollment_id = ?", [fixture.enrollmentId]),
    ).resolves.toEqual([{ count: "2" }])
  })

  it("rejects provider and amount mismatches before changing payment state", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "mismatch" })
    const order = await createOrder(app, fixture, `order-${scope}-mismatch`)
    const payment = await startMockPayment(app, fixture, order.id)

    // When
    const providerMismatch = await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(
      mockEventBody({
        eventId: `event-${scope}-provider`,
        orderId: order.id,
        transactionId: `transaction-${scope}-provider`,
        amountFen: order.amountFen,
        status: "succeeded",
        provider: "untrusted_provider",
      }),
    ).expect(400)
    const amountMismatch = await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(
      mockEventBody({
        eventId: `event-${scope}-amount`,
        orderId: order.id,
        transactionId: `transaction-${scope}-amount`,
        amountFen: 1,
        status: "succeeded",
      }),
    ).expect(400)

    // Then
    expect(providerMismatch.body).toEqual(expect.objectContaining({ code: "provider_mismatch" }))
    expect(amountMismatch.body).toEqual(expect.objectContaining({ code: "amount_mismatch" }))
    await expect(dataSource.query("select status from payments where id = ?", [payment.id])).resolves.toEqual([
      { status: "pending" },
    ])
  })

  it("rejects conflicting reuse of an event identifier", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "event-conflict" })
    const order = await createOrder(app, fixture, `order-${scope}-event-conflict`)
    await startMockPayment(app, fixture, order.id)
    const eventId = `event-${scope}-conflict`
    await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(
      mockEventBody({ eventId, orderId: order.id, transactionId: `transaction-${scope}-conflict`, amountFen: 2400, status: "failed" }),
    ).expect(201)

    // When
    const conflict = await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(
      mockEventBody({ eventId, orderId: order.id, transactionId: `transaction-${scope}-conflict`, amountFen: 2400, status: "succeeded" }),
    ).expect(409)

    // Then
    expect(conflict.body).toEqual(expect.objectContaining({ code: "event_conflict" }))
    await expect(
      dataSource.query("select count(*) as count from payment_events where provider_event_id = ?", [eventId]),
    ).resolves.toEqual([{ count: "1" }])
  })

  it("lets success win when failed and delayed callbacks arrive out of order", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "ordering" })
    const order = await createOrder(app, fixture, `order-${scope}-ordering`)
    const payment = await startMockPayment(app, fixture, order.id)
    const transactionId = `transaction-${scope}-ordering`

    // When
    const events = [
      [`event-${scope}-failed-first`, "failed"],
      [`event-${scope}-success`, "succeeded"],
      [`event-${scope}-failed-late`, "failed"],
    ] as const
    for (const [eventId, status] of events) {
      await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(
        mockEventBody({ eventId, orderId: order.id, transactionId, amountFen: order.amountFen, status }),
      ).expect(201)
    }

    // Then
    await expect(dataSource.query("select status from payments where id = ?", [payment.id])).resolves.toEqual([
      { status: "succeeded" },
    ])
    await expect(dataSource.query("select status from orders where id = ?", [order.id])).resolves.toEqual([
      { status: "paid" },
    ])
    await expect(
      dataSource.query("select count(*) as count from payment_events where payment_id = ?", [payment.id]),
    ).resolves.toEqual([{ count: "3" }])
    await expect(
      dataSource.query("select count(*) as count from roster_entries where enrollment_id = ?", [fixture.enrollmentId]),
    ).resolves.toEqual([{ count: "2" }])
  })

  it("does not pay a cancelled order", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "cancelled" })
    const order = await createOrder(app, fixture, `order-${scope}-cancelled`)
    const payment = await startMockPayment(app, fixture, order.id)
    await dataSource.query("update orders set status = ? where id = ?", [ORDER_STATUS.cancelled, order.id])

    // When
    const response = await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(
      mockEventBody({
        eventId: `event-${scope}-cancelled`,
        orderId: order.id,
        transactionId: `transaction-${scope}-cancelled`,
        amountFen: order.amountFen,
        status: "succeeded",
      }),
    ).expect(409)

    // Then
    expect(response.body).toEqual(expect.objectContaining({ code: "order_not_payable" }))
    await expect(dataSource.query("select status from payments where id = ?", [payment.id])).resolves.toEqual([
      { status: "pending" },
    ])
    await expect(
      dataSource.query("select count(*) as count from roster_entries where enrollment_id = ?", [fixture.enrollmentId]),
    ).resolves.toEqual([{ count: "0" }])
  })

  it("rejects a provider transaction reused by another order", async () => {
    // Given
    const firstFixture = await createPaidEnrollmentFixture({
      app,
      scope: `${scope}-a`,
      family: "transaction",
    })
    const firstOrder = await createOrder(app, firstFixture, `order-${scope}-transaction-first`)
    await startMockPayment(app, firstFixture, firstOrder.id)
    const transactionId = `transaction-${scope}-shared`
    await request(app.getHttpServer()).post("/payments/mock/events").set(firstFixture.headers).send(
      mockEventBody({ eventId: `event-${scope}-first`, orderId: firstOrder.id, transactionId, amountFen: firstOrder.amountFen, status: "failed" }),
    ).expect(201)
    const secondFixture = await createPaidEnrollmentFixture({
      app,
      scope: `${scope}-b`,
      family: "transaction",
    })
    const secondOrder = await createOrder(app, secondFixture, `order-${scope}-transaction-second`)
    await startMockPayment(app, secondFixture, secondOrder.id)

    // When
    const conflict = await request(app.getHttpServer()).post("/payments/mock/events").set(secondFixture.headers).send(
      mockEventBody({ eventId: `event-${scope}-second`, orderId: secondOrder.id, transactionId, amountFen: secondOrder.amountFen, status: "succeeded" }),
    ).expect(409)

    // Then
    expect(conflict.body).toEqual(expect.objectContaining({ code: "transaction_conflict" }))
  })
})
