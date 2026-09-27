import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl,
  DEV_ADMIN_HEADERS, initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import {
  createOrder, createPaidEnrollmentFixture, mockEventBody, resetMockPaymentData, startMockPayment,
  type PaidEnrollmentFixture,
} from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Optional minimum participants HTTP and read model", () => {
  let app: INestApplication
  let scope: string
  let fixture: PaidEnrollmentFixture

  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => {
    scope = createScope()
    app = await createCatalogTripApp()
    fixture = await createPaidEnrollmentFixture({ app, scope, family: "Minimum", participantCount: 2 })
  })
  afterEach(async () => {
    await app.close()
    await resetMockPaymentData(scope)
  })
  afterAll(closeCatalogTripDatabase)

  it("defaults existing creation requests to disabled and preserves all core values", async () => {
    const result = await request(app.getHttpServer()).get("/tour-sessions").expect(200)
    expect(result.body).toEqual(expect.arrayContaining([expect.objectContaining({
      id: fixture.tourSessionId, capacity: 30, minimumParticipants: null, occupiedCapacity: 0, status: "published",
    })]))
  })

  it("enables, retains and clears the reference through partial updates", async () => {
    const path = `/tour-sessions/${fixture.tourSessionId}`
    const enabled = await request(app.getHttpServer()).patch(path).set(DEV_ADMIN_HEADERS).send({ minimumParticipants: 10 }).expect(200)
    expect(enabled.body).toMatchObject({ minimumParticipants: 10, occupiedCapacity: 0, status: "published" })
    const retained = await request(app.getHttpServer()).patch(path).set(DEV_ADMIN_HEADERS).send({ priceFen: 1500 }).expect(200)
    expect(retained.body.minimumParticipants).toBe(10)
    const disabled = await request(app.getHttpServer()).patch(path).set(DEV_ADMIN_HEADERS).send({ minimumParticipants: null }).expect(200)
    expect(disabled.body.minimumParticipants).toBeNull()
  })

  it.each([0, -1, 1.5, 31, "10"])("rejects invalid minimum %s without changing the stored session", async (minimumParticipants) => {
    const rejected = await request(app.getHttpServer()).patch(`/tour-sessions/${fixture.tourSessionId}`)
      .set(DEV_ADMIN_HEADERS).send({ minimumParticipants }).expect(400)
    expect(rejected.body.code).toBe("malformed_input")
    expect(await dataSource.query("select minimum_participants from tour_sessions where id = ?", [fixture.tourSessionId]))
      .toEqual([{ minimum_participants: null }])
  })

  it("rejects a lower capacity than the retained minimum", async () => {
    const path = `/tour-sessions/${fixture.tourSessionId}`
    await request(app.getHttpServer()).patch(path).set(DEV_ADMIN_HEADERS).send({ minimumParticipants: 10 }).expect(200)
    await request(app.getHttpServer()).patch(path).set(DEV_ADMIN_HEADERS).send({ capacity: 9 }).expect(400)
    expect(await dataSource.query("select capacity, minimum_participants from tour_sessions where id = ?", [fixture.tourSessionId]))
      .toEqual([{ capacity: 30, minimum_participants: 10 }])
  })

  it("uses the same valid paid people as capacity before payment, after payment and after cancellation", async () => {
    await request(app.getHttpServer()).patch(`/tour-sessions/${fixture.tourSessionId}`)
      .set(DEV_ADMIN_HEADERS).send({ minimumParticipants: 2 }).expect(200)
    const order = await createOrder(app, fixture, `${scope}-minimum`)
    await startMockPayment(app, fixture, order.id)
    await expectCount(0)
    await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(mockEventBody({
      eventId: `${scope}-event`, transactionId: `${scope}-transaction`, orderId: order.id, amountFen: order.amountFen, status: "succeeded",
    })).expect(201)
    await expectCount(2)
    await dataSource.query("update roster_entries set status = 'cancelled' where enrollment_participant_id = ?", [fixture.participantIds[0]])
    await expectCount(1)
    expect(await dataSource.query("select status from tour_sessions where id = ?", [fixture.tourSessionId]))
      .toEqual([{ status: "published" }])
    expect(await dataSource.query("select status from orders where id = ?", [order.id])).toEqual([{ status: "paid" }])
  })

  async function expectCount(count: number): Promise<void> {
    const list = await request(app.getHttpServer()).get("/tour-sessions").expect(200)
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({
      id: fixture.tourSessionId, minimumParticipants: 2, occupiedCapacity: count,
    })]))
    const capacity = await request(app.getHttpServer()).get(`/tour-sessions/${fixture.tourSessionId}/enrollment-availability`)
      .query({ at: "2026-09-27T00:00:00Z" }).expect(200)
    expect(capacity.body).toMatchObject({ occupiedCapacity: count, remainingCapacity: 30 - count })
  }
})
