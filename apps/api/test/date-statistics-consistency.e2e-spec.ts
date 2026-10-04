import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource, databaseUrl, DEV_ADMIN_HEADERS, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createCatalog, restoreNodeEnv } from "./enrollment-consent-fixture.js"
import { createOrder, createPaidEnrollmentFixture } from "./mock-payment-fixture.js"
import { payEnrollment, schoolStaffHeaders } from "./roster-export-fixture.js"
import { cleanupConsistencyData, createScopedStaff } from "./data-consistency-fixture.js"

describe.skipIf(databaseUrl === undefined)("Cumulative payment and refund statistics", () => {
  let app: INestApplication
  let scope: string
  const previousEnv = process.env["NODE_ENV"]
  const previousKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 17).toString("base64")
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
  })
  beforeEach(() => { scope = createScope().slice(0, 35) })
  afterEach(async () => { await cleanupConsistencyData(scope) })
  afterAll(async () => {
    await app.close()
    await closeCatalogTripDatabase()
    restoreNodeEnv(previousEnv)
    if (previousKey === undefined) delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    else process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = previousKey
  })

  async function statistics(schoolId: string) {
    return request(app.getHttpServer()).get("/roster/date-statistics").set(DEV_ADMIN_HEADERS)
      .query({ from: "2027-02-01", until: "2027-02-01", schoolId }).expect(200)
  }

  it.each([1201, 1, 188001])("preserves original %i-fen payments through pending, failed, partial and full refunds", async priceFen => {
    const catalog = await createCatalog(app, scope)
    await dataSource.query("update tour_sessions set price_fen=? where id=?", [priceFen, catalog.tourSessionId])
    const orderId = await payEnrollment({ app, scope, catalog, family: "paid", names: ["Synthetic A", "Synthetic B"], status: "succeeded" })
    const lines: readonly { readonly id: string }[] = await dataSource.query("select id from order_lines where order_id=? order by id", [orderId])
    const staff = await createScopedStaff({ scope, permissions: ["orders.read", "refunds.manage"], staffScope: { kind: "all", id: null } })
    const readBefore = await moneySnapshot(orderId)
    const before = await statistics(catalog.schoolId)
    expect(before.body.totals).toMatchObject({ paymentAmountFen: priceFen * 2, refundAmountFen: 0, paidHeadcount: 2 })
    expect(await moneySnapshot(orderId)).toEqual(readBefore)
    const createRefund = (lineIds: readonly string[]) => request(app.getHttpServer()).post(`/staff/orders/${orderId}/refunds`).set(staff)
      .send({ lineIds, reason: "synthetic consistency regression", idempotencyKey: `${scope}-${lineIds.join("-")}-${Date.now()}` }).expect(201)
    const processRefund = (refundId: string, outcome: "succeeded" | "failed") => request(app.getHttpServer())
      .post(`/staff/orders/${orderId}/refunds/${refundId}/local-result`).set(staff).send({ outcome }).expect(201)
    const selected = lines.slice(0, 1).map(line => line.id)
    const failed = await createRefund(selected)
    expect((await statistics(catalog.schoolId)).body.totals).toMatchObject({ paymentAmountFen: priceFen * 2, refundAmountFen: 0, paidHeadcount: 2 })
    await processRefund(String(failed.body.id), "failed")
    expect((await statistics(catalog.schoolId)).body.totals).toMatchObject({ paymentAmountFen: priceFen * 2, refundAmountFen: 0, paidHeadcount: 2 })
    const partial = await createRefund(selected)
    await processRefund(String(partial.body.id), "succeeded")
    expect((await statistics(catalog.schoolId)).body.totals).toMatchObject({ paymentAmountFen: priceFen * 2, refundAmountFen: priceFen, paidHeadcount: 1 })
    const remaining = await createRefund(lines.slice(1).map(line => line.id))
    await processRefund(String(remaining.body.id), "succeeded")
    expect(await dataSource.query("select status,amount_fen from payments where order_id=?", [orderId])).toEqual([{ status: "refunded", amount_fen: priceFen * 2 }])
    const fullSnapshot = await moneySnapshot(orderId)
    expect((await statistics(catalog.schoolId)).body.totals).toMatchObject({ paymentAmountFen: priceFen * 2, refundAmountFen: priceFen * 2, paidHeadcount: 0 })
    expect(await moneySnapshot(orderId)).toEqual(fullSnapshot)
  })

  it("excludes failed, pending and unpaid orders and keeps successful sub-yuan amounts in integer fen", async () => {
    const catalog = await createCatalog(app, scope)
    await dataSource.query("update tour_sessions set price_fen=101 where id=?", [catalog.tourSessionId])
    await payEnrollment({ app, scope, catalog, family: "success", names: ["Synthetic Success"], status: "succeeded" })
    await payEnrollment({ app, scope, catalog, family: "failed", names: ["Synthetic Failure"], status: "failed" })
    const pendingId = await payEnrollment({ app, scope, catalog, family: "pending", names: ["Synthetic Pending"], status: "failed" })
    await dataSource.query("update payments set status='pending' where order_id=?", [pendingId])
    const totals = (await statistics(catalog.schoolId)).body.totals
    expect(totals).toMatchObject({ paymentAmountFen: 101, refundAmountFen: 0, paidHeadcount: 1 })
    expect(Number.isInteger(totals.paymentAmountFen)).toBe(true)
    const unpaid = await createPaidEnrollmentFixture({ app, scope: `${scope}-u`, family: "unpaid", participantCount: 1 })
    await createOrder(app, unpaid, `${scope}-unpaid`)
    const rows: readonly { readonly organization_id: string }[] = await dataSource.query("select organization_id from tour_sessions where id=?", [unpaid.tourSessionId])
    expect(rows[0]).toBeDefined()
    const unpaidSummary = await statistics(rows[0]?.organization_id ?? "")
    expect(unpaidSummary.body.totals).toMatchObject({ paymentAmountFen: 0, refundAmountFen: 0, paidHeadcount: 0 })
  })

  it("retains Beijing departure-day boundaries, multiple-session totals and school isolation independently of payment dates", async () => {
    const baseline = await request(app.getHttpServer()).get("/roster/date-statistics").set(DEV_ADMIN_HEADERS)
      .query({ from: "2027-02-01", until: "2027-02-01" }).expect(200)
    const existingSessionIds = new Set<string>(baseline.body.rows.map((row: { readonly sessionId: string }) => row.sessionId))
    const catalogs = []
    for (const [suffix, startsAt, amount] of [
      ["before", "2027-01-31T15:59:59.999Z", 5],
      ["first", "2027-01-31T16:00:00.000Z", 101],
      ["last", "2027-02-01T15:59:59.999Z", 203],
      ["after", "2027-02-01T16:00:00.000Z", 7],
    ] as const) {
      const localScope = `${scope}-${suffix}`
      const catalog = await createCatalog(app, localScope)
      await dataSource.query("update tour_sessions set starts_at=?, price_fen=? where id=?", [new Date(startsAt), amount, catalog.tourSessionId])
      await payEnrollment({ app, scope: localScope, catalog, family: suffix, names: [`Synthetic ${suffix}`], status: "succeeded" })
      catalogs.push({ ...catalog, suffix })
    }
    const summary = await request(app.getHttpServer()).get("/roster/date-statistics").set(DEV_ADMIN_HEADERS)
      .query({ from: "2027-02-01", until: "2027-02-01" }).expect(200)
    expect(summary.body.rows.filter((row: { readonly sessionId: string }) => existingSessionIds.has(row.sessionId))).toEqual(baseline.body.rows)
    expect(summary.body.rows.filter((row: { readonly sessionId: string }) => !existingSessionIds.has(row.sessionId))
      .map((row: { readonly sessionId: string }) => row.sessionId)).toEqual(
      catalogs.filter(catalog => ["first", "last"].includes(catalog.suffix)).map(catalog => catalog.tourSessionId))
    expect(summary.body.totals).toMatchObject({
      paymentAmountFen: baseline.body.totals.paymentAmountFen + 304,
      refundAmountFen: baseline.body.totals.refundAmountFen,
      paidHeadcount: baseline.body.totals.paidHeadcount + 2,
    })
    const first = catalogs.find(catalog => catalog.suffix === "first")
    if (first === undefined) throw new Error("synthetic first-day catalog missing")
    expect((await statistics(first.schoolId)).body.totals).toMatchObject({ paymentAmountFen: 101, refundAmountFen: 0, paidHeadcount: 1 })
    await request(app.getHttpServer()).get("/roster/date-statistics").set(schoolStaffHeaders(first.schoolId))
      .query({ from: "2027-02-01", until: "2027-02-01", schoolId: first.schoolId }).expect(403)
  })
})

async function moneySnapshot(orderId: string) {
  return Promise.all([
    dataSource.query("select status,amount_fen,paid_fen from orders where id=?", [orderId]),
    dataSource.query("select id,status,amount_fen from payments where order_id=? order by id", [orderId]),
    dataSource.query("select id,amount_fen from order_lines where order_id=? order by id", [orderId]),
    dataSource.query("select id,status,amount_fen from refund_requests where order_id=? order by id", [orderId]),
  ])
}
