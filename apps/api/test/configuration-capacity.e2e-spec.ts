import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { EntitySubscriberInterface } from "typeorm"
import { PaymentEntity, TourSessionEntity } from "../src/domain/entities/index.js"
import { ConfigurationDatabaseService } from "../src/modules/configuration/configuration-database.service.js"
import { ConfigurationModule } from "../src/modules/configuration/configuration.module.js"
import {
  closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl,
  DEV_ADMIN_HEADERS, initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import {
  createOrder, createPaidEnrollmentFixture, mockEventBody, resetMockPaymentData, startMockPayment,
  type PaidEnrollmentFixture,
} from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Tour session capacity edits", () => {
  let app: INestApplication
  let scope: string
  let fixture: PaidEnrollmentFixture
  let order: Awaited<ReturnType<typeof createOrder>>

  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => {
    scope = createScope()
    app = await createCatalogTripApp()
    fixture = await createPaidEnrollmentFixture({ app, scope, family: "CapacityEdit", participantCount: 2 })
    order = await createOrder(app, fixture, `${scope}-capacity-edit`)
    await startMockPayment(app, fixture, order.id)
  })
  afterEach(async () => {
    await app.close()
    await resetMockPaymentData(scope)
  })
  afterAll(closeCatalogTripDatabase)

  it("rejects reduction below paid participants without saving other edits", async () => {
    // Given
    await pay().expect(201)
    // When
    const result = await patch({ capacity: 1, priceFen: 1500 }).expect(409)
    // Then
    expect(result.body).toMatchObject({ code: "capacity_below_occupied", occupiedCapacity: 2 })
    const session = await dataSource.manager.findOneByOrFail(TourSessionEntity, { id: fixture.tourSessionId })
    expect(session).toMatchObject({ capacity: 30, priceFen: 1200 })
  })

  it.each([2, 35])("accepts capacity %s when it accommodates paid participants", async capacity => {
    // Given
    await pay().expect(201)
    // When
    const result = await patch({ capacity }).expect(200)
    // Then
    expect(result.body).toMatchObject({ capacity, occupiedCapacity: 2 })
  })

  it.each(["local_mock", "wechat_pay"])("retains the unpaid capacity policy for %s", async channel => {
    // Given
    await dataSource.manager.update(PaymentEntity, { orderId: order.id }, { channel })
    // When
    const result = await patch({ capacity: 1 }).expect(200)
    // Then
    expect(result.body).toMatchObject({ capacity: 1, occupiedCapacity: 0 })
  })

  it("excludes cancelled paid participants from the minimum capacity", async () => {
    // Given
    await pay().expect(201)
    await dataSource.query("update roster_entries set status = 'cancelled' where enrollment_participant_id = ?", [fixture.participantIds[0]])
    // When
    const result = await patch({ capacity: 1 }).expect(200)
    // Then
    expect(result.body).toMatchObject({ capacity: 1, occupiedCapacity: 1 })
  })

  it("serializes capacity reduction with payment settlement", async () => {
    // Given
    // When
    const [payment, update] = await Promise.all([pay(), patch({ capacity: 1 })])
    // Then
    expect([[201, 409], [409, 200]]).toContainEqual([payment.status, update.status])
    const session = await dataSource.manager.findOneByOrFail(TourSessionEntity, { id: fixture.tourSessionId })
    const rows: readonly { readonly count: string }[] = await dataSource.query(
      "select count(*) as count from roster_entries where tour_session_id = ? and status != 'cancelled'", [fixture.tourSessionId],
    )
    expect(Number(rows[0]?.count)).toBeLessThanOrEqual(session.capacity)
  })

  it("counts the committed occupancy after waiting for the session lock", async () => {
    // Given
    await pay().expect(201)
    const runner = dataSource.createQueryRunner()
    const appDatabase = await app.select(ConfigurationModule).get(ConfigurationDatabaseService, { strict: true }).getDataSource()
    const observer: EntitySubscriberInterface = {}
    const lockAttempted = new Promise<void>(resolve => {
      observer.beforeQuery = event => {
        if (event.query.includes("tour_sessions") && event.query.includes("FOR UPDATE")) resolve()
      }
    })
    appDatabase.subscribers.push(observer)
    let barrierTimer: ReturnType<typeof setTimeout> | undefined
    let pending: Promise<request.Response> | undefined
    await runner.connect()
    await runner.startTransaction()
    try {
      await runner.manager.findOne(TourSessionEntity, { where: { id: fixture.tourSessionId }, lock: { mode: "pessimistic_write" } })
      await runner.query("update roster_entries set status = 'cancelled' where enrollment_participant_id = ?", [fixture.participantIds[0]])
      // When
      pending = patch({ capacity: 1 }).then(response => response)
      await Promise.race([
        lockAttempted,
        new Promise<never>((_resolve, reject) => {
          barrierTimer = setTimeout(() => reject(new Error("Configuration update did not attempt the session lock")), 2000)
        }),
      ])
      await runner.commitTransaction()
      const result = await pending
      // Then
      expect(result.status).toBe(200)
      expect(result.body).toMatchObject({ capacity: 1, occupiedCapacity: 1 })
    } finally {
      if (barrierTimer !== undefined) clearTimeout(barrierTimer)
      appDatabase.subscribers.splice(appDatabase.subscribers.indexOf(observer), 1)
      if (runner.isTransactionActive) await runner.rollbackTransaction()
      await runner.release()
      await Promise.allSettled(pending === undefined ? [] : [pending])
    }
  })

  function patch(body: { readonly capacity: number; readonly priceFen?: number }) {
    return request(app.getHttpServer()).patch(`/tour-sessions/${fixture.tourSessionId}`).set(DEV_ADMIN_HEADERS).send(body)
  }

  function pay() {
    return request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(mockEventBody({
      eventId: `${scope}-event`, transactionId: `${scope}-transaction`, orderId: order.id, amountFen: order.amountFen, status: "succeeded",
    }))
  }
})
