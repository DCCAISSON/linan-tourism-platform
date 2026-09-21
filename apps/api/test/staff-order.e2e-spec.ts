import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource,
  databaseUrl, DEV_ADMIN_HEADERS, initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import { restoreNodeEnv } from "./enrollment-consent-fixture.js"
import { createOrder, createPaidEnrollmentFixture, mockEventBody, resetMockPaymentData, startMockPayment } from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Staff order review and local refund validation", () => {
  let app: INestApplication
  let scope: string
  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => { scope = createScope(); app = await createCatalogTripApp() })
  afterEach(async () => { await app.close(); await resetMockPaymentData(scope) })
  afterAll(closeCatalogTripDatabase)

  it("lets an administrator find a paid order, read stored participants and simulate one-person refund without mutation", async () => {
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "staff" })
    await dataSource.query("update tour_sessions set price_fen = ? where id = ?", [12800, fixture.tourSessionId])
    const order = await createOrder(app, fixture, `${scope}-staff`)
    await startMockPayment(app, fixture, order.id)
    await request(app.getHttpServer()).post("/payments/mock/events").set(fixture.headers).send(mockEventBody({
      eventId: `${scope}-paid`, orderId: order.id, transactionId: `${scope}-transaction`, amountFen: order.amountFen, status: "succeeded",
    })).expect(201)
    const before = await dataSource.query("select status, paid_fen from orders where id = ?", [order.id])

    const detail = await request(app.getHttpServer()).get(`/staff/orders/${order.id}`).set(DEV_ADMIN_HEADERS).expect(200)
    const list = await request(app.getHttpServer()).get("/staff/orders").set(DEV_ADMIN_HEADERS)
      .query({ keyword: detail.body.code, page: 1 }).expect(200)
    const lineId = detail.body.participants[0].id
    const preview = await request(app.getHttpServer()).post(`/staff/orders/${order.id}/refund-preview`)
      .set(DEV_ADMIN_HEADERS).send({ lineIds: [lineId] }).expect(201)
    const simulation = await request(app.getHttpServer()).post(`/staff/orders/${order.id}/refund-simulation`)
      .set(DEV_ADMIN_HEADERS).send({ lineIds: [lineId], outcome: "succeeded" }).expect(201)

    expect(list.body.orders).toEqual(expect.arrayContaining([expect.objectContaining({ id: order.id, amountFen: 25600, participantCount: 2 })]))
    expect(detail.body.participants).toHaveLength(2)
    expect(preview.body).toEqual(expect.objectContaining({ participantCount: 1, amountFen: 12800, settlementPerformed: false }))
    expect(simulation.body).toEqual(expect.objectContaining({ outcome: "succeeded", amountFen: 12800, settlementPerformed: false }))
    expect(await dataSource.query("select status, paid_fen from orders where id = ?", [order.id])).toEqual(before)
  })

  it("rejects school and guide identities, unauthenticated reads and malformed filters", async () => {
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "scoped" })
    const order = await createOrder(app, fixture, `${scope}-scoped`)
    const schoolHeaders = { "x-linan-dev-staff-id": "school-user", "x-linan-dev-staff-role": "school", "x-linan-dev-staff-school-id": "school-1" }
    const financeHeaders = { "x-linan-dev-staff-id": "finance-user", "x-linan-dev-staff-role": "finance" }

    await request(app.getHttpServer()).get("/staff/orders").expect(401)
    await request(app.getHttpServer()).get("/staff/orders").set(schoolHeaders).expect(403)
    await request(app.getHttpServer()).get("/staff/orders").set(financeHeaders).expect(403)
    await request(app.getHttpServer()).get(`/staff/orders/${order.id}`).set(schoolHeaders).expect(403)
    await request(app.getHttpServer()).post(`/staff/orders/${order.id}/refund-preview`).set(schoolHeaders).send({ lineIds: ["line-1"] }).expect(403)
    await request(app.getHttpServer()).get("/staff/orders").set(DEV_ADMIN_HEADERS).query({ page: "0" }).expect(400)
  })

  it("keeps developer identity and refund simulation inaccessible in production", async () => {
    const previous = process.env["NODE_ENV"]
    process.env["NODE_ENV"] = "production"
    try {
      const response = await request(app.getHttpServer()).get("/staff/orders").set(DEV_ADMIN_HEADERS).expect(401)
      expect(response.body.code).toBe("staff_identity_unavailable")
    } finally { restoreNodeEnv(previous) }
  })
})
