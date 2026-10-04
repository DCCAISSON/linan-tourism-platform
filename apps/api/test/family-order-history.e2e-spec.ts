import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource,
  databaseUrl, initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import { familyHeader, restoreNodeEnv, virtualPhone } from "./enrollment-consent-fixture.js"
import { createOrder, createPaidEnrollmentFixture, resetMockPaymentData } from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Own-family order history", () => {
  let app: INestApplication
  let scope: string

  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => { scope = createScope(); app = await createCatalogTripApp() })
  afterEach(async () => { await app.close(); await resetMockPaymentData(scope) })
  afterAll(closeCatalogTripDatabase)

  it("lists only the server-resolved family's orders when another family has orders", async () => {
    // Given
    const owner = await createPaidEnrollmentFixture({ app, scope: `${scope}-owner`, family: "owner" })
    const ownerSecond = await createPaidEnrollmentFixture({ app, scope: `${scope}-two`, family: "owner" })
    const other = await createPaidEnrollmentFixture({ app, scope: `${scope}-other`, family: "other" })
    const order = await createOrder(app, owner, `${scope}-owner`)
    const secondOrder = await createOrder(app, ownerSecond, `${scope}-owner-second`)
    await dataSource.query("update families set code = ? where code = ?", [`family-${scope}-owner`, `family-${scope}-two`])
    await createOrder(app, other, `${scope}-other`)

    // When
    const response = await request(app.getHttpServer()).get("/orders").set(owner.headers)
      .query({ familyId: "forged", familyCode: `family-${scope}-other` }).expect(200)

    // Then
    expect(response.body).toHaveLength(2)
    expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({
      id: order.id, activityTitle: "Enrollment Trip", schoolName: "Enrollment School",
      tourSessionId: owner.tourSessionId, participantCount: 2, amountFen: 2400, paidFen: 0,
      startsAt: "2027-02-01T00:00:00.000Z", endsAt: "2027-02-02T00:00:00.000Z",
      createdAt: expect.any(String),
    }), expect.objectContaining({ id: secondOrder.id })]))
  })

  it("returns an empty list when the family has no orders", async () => {
    // Given
    const headers = familyHeader(scope, "empty")
    // When
    const response = await request(app.getHttpServer()).get("/orders").set(headers).expect(200)
    // Then
    expect(response.body).toEqual([])
  })

  it("keeps historical participant names and prices when profiles and the session price change", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "snapshot" })
    const order = await createOrder(app, fixture, `${scope}-snapshot`)
    await dataSource.query("update family_members set display_name = ? where family_id in (select id from families where code = ?)",
      ["Changed Profile", `family-${scope}`])
    await dataSource.query("update tour_sessions set price_fen = ? where id = ?", [99999, fixture.tourSessionId])

    // When
    const response = await request(app.getHttpServer()).get(`/orders/${order.id}/detail`).set(fixture.headers).expect(200)

    // Then
    expect(response.body).toEqual(expect.objectContaining({
      id: order.id, amountFen: 2400, contactName: "Payment Parent snapshot",
      emergencyContactName: "Payment Emergency snapshot", emergencyContactPhone: virtualPhone("0008"),
      participants: expect.arrayContaining([1, 2].map((index) => expect.objectContaining({
        id: expect.any(String), enrollmentParticipantId: expect.any(String),
        displayName: `Payment Child ${String.fromCharCode(64 + index)}`, gradeName: "Grade One", className: "Class One", amountFen: 1200,
      }))),
    }))
    expect(response.body.participants).toHaveLength(2)
  })

  it("denies direct detail reads when the stored order belongs to another family", async () => {
    // Given
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "owner" })
    const order = await createOrder(app, fixture, `${scope}-scope`)
    // When
    const response = await request(app.getHttpServer()).get(`/orders/${order.id}/detail`)
      .set(familyHeader(scope, "other")).expect(404)
    // Then
    expect(response.body.code).toBe("not_found")
    expect(response.body.participants).toBeUndefined()
  })

  it("denies history reads when local identity headers are absent or production is active", async () => {
    // Given
    const previous = process.env["NODE_ENV"]
    await request(app.getHttpServer()).get("/orders").expect(401)
    process.env["NODE_ENV"] = "production"
    try {
      // When
      const response = await request(app.getHttpServer()).get("/orders").set(familyHeader(scope, "owner")).expect(401)
      // Then
      expect(response.body.code).toBe("identity_unavailable")
    } finally { restoreNodeEnv(previous) }
  })
})
