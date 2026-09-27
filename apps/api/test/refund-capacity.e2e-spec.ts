import type { INestApplication } from "@nestjs/common"
import ExcelJS from "exceljs"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  closeCatalogTripDatabase, createCatalogTripApp, createScope, dataSource,
  databaseUrl, initializeCatalogTripDatabase,
} from "./catalog-trip-fixture.js"
import {
  type CatalogFixture, createCatalog, createMember, enrollmentBody, familyHeader, virtualPhone,
} from "./enrollment-consent-fixture.js"
import { createOrder, mockEventBody, resetMockPaymentData, startMockPayment } from "./mock-payment-fixture.js"
import { collectBinary } from "./roster-export-fixture.js"

type PendingOrder = {
  readonly id: string
  readonly amountFen: number
  readonly headers: Record<string, string>
}

describe.skipIf(databaseUrl === undefined)("Refund roster and paid capacity", () => {
  let app: INestApplication
  let scope: string
  let staffHeaders: Record<string, string>

  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => {
    scope = createScope().replace("catalog-trip-", "capacity-")
    app = await createCatalogTripApp()
    const staffId = `staff-${scope}`
    await dataSource.query(
      "insert into staff_accounts (id, username, display_name, password_hash, status, force_password_change, failed_login_attempts, permissions_version, created_at, updated_at) values (?, ?, 'Capacity Operator', 'test-hash', 'active', false, 0, 1, current_timestamp(6), current_timestamp(6))",
      [staffId, staffId],
    )
    staffHeaders = { "x-linan-dev-staff-id": staffId, "x-linan-dev-staff-role": "administrator" }
  })
  afterEach(async () => {
    await app.close()
    await dataSource.query(
      "delete line from refund_request_lines line join refund_requests refund on refund.id = line.refund_request_id where refund.requested_by_staff_id = ?",
      [`staff-${scope}`],
    )
    await dataSource.query("delete from refund_requests where requested_by_staff_id = ?", [`staff-${scope}`])
    await resetMockPaymentData(scope)
    await dataSource.query("delete from staff_accounts where id = ?", [`staff-${scope}`])
  })
  afterAll(closeCatalogTripDatabase)

  it.each([
    { name: "one succeeded refund", outcome: "succeeded", selectedCount: 1, remainingPeople: 1 },
    { name: "one failed refund", outcome: "failed", selectedCount: 1, remainingPeople: 2 },
    { name: "all succeeded refunds", outcome: "succeeded", selectedCount: 2, remainingPeople: 0 },
  ] as const)("updates roster, Excel, net totals and capacity after $name", async ({ outcome, selectedCount, remainingPeople }) => {
    // Given
    const baseline = await request(app.getHttpServer()).get("/roster/workbench").set(staffHeaders).expect(200)
    const catalog = await capacityCatalog(2)
    const order = await pendingOrder(catalog, "refund", 2)
    await pay(order).expect(201)
    const before = await availability(catalog)
    const lines: readonly { readonly id: string }[] = await dataSource.query(
      "select id from order_lines where order_id = ? order by id", [order.id],
    )
    const refund = await request(app.getHttpServer()).post(`/staff/orders/${order.id}/refunds`).set(staffHeaders)
      .send({ lineIds: lines.slice(0, selectedCount).map((line) => line.id), reason: "parent cancellation", idempotencyKey: `${scope}-refund` })
      .expect(201)

    // When
    await request(app.getHttpServer()).post(`/staff/orders/${order.id}/refunds/${refund.body.id}/local-result`)
      .set(staffHeaders).send({ outcome }).expect(201)

    // Then
    const totals = { paidHeadcount: remainingPeople, paidAmountFen: remainingPeople * 12800 }
    const summary = await request(app.getHttpServer()).get("/roster/summary").set(staffHeaders)
      .query({ tourSessionId: catalog.tourSessionId }).expect(200)
    expect(summary.body).toMatchObject(totals)
    expect(summary.body.rows).toHaveLength(remainingPeople)
    const paymentSummary = await request(app.getHttpServer()).get("/roster/payment-summary").set(staffHeaders)
      .query({ tourSessionId: catalog.tourSessionId }).expect(200)
    expect(paymentSummary.body).toMatchObject(totals)
    const workbench = await request(app.getHttpServer()).get("/roster/workbench").set(staffHeaders).expect(200)
    expect(workbench.body).toMatchObject({
      paidHeadcount: baseline.body.paidHeadcount + remainingPeople,
      paidAmountFen: baseline.body.paidAmountFen + remainingPeople * 12800,
    })
    const exported = await request(app.getHttpServer()).get("/roster/export.xlsx").set(staffHeaders)
      .query({ tourSessionId: catalog.tourSessionId }).buffer(true).parse(collectBinary).expect(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(exported.body)
    const sheet = workbook.getWorksheet("Roster")
    expect(sheet?.rowCount).toBe(remainingPeople + 1)
    if (remainingPeople > 0) expect(sheet?.getRow(2).getCell(7).value).toBe(12800)
    const available = await availability(catalog).expect(remainingPeople === 2 ? 400 : 200)
    expect(available.body).toMatchObject({ capacity: 2, occupiedCapacity: remainingPeople, remainingCapacity: 2 - remainingPeople })
    expect(before.status).toBe(400)
    expect(before.body).toMatchObject({ code: "stale_state", capacity: 2, occupiedCapacity: 2, remainingCapacity: 0 })
  })

  it("does not reserve capacity for unpaid orders and rolls back an oversized payment", async () => {
    // Given
    const catalog = await capacityCatalog(1)
    const order = await pendingOrder(catalog, "too-large", 2)
    const before = await availability(catalog).expect(200)

    // When
    const result = await pay(order).expect(409)

    // Then
    expect(result.body.code).toBe("tour_session_full")
    expect(before.body).toMatchObject({ available: true, capacity: 1, occupiedCapacity: 0, remainingCapacity: 1 })
    const after = await availability(catalog).expect(200)
    expect(after.body).toEqual(before.body)
    await expect(dataSource.query("select status, paid_fen as paidFen from orders where id = ?", [order.id]))
      .resolves.toEqual([{ status: "pending_payment", paidFen: 0 }])
    await expect(dataSource.query("select status from payments where order_id = ?", [order.id]))
      .resolves.toEqual([{ status: "pending" }])
    await expect(dataSource.query(
      "select event.id from payment_events event join payments payment on payment.id = event.payment_id where payment.order_id = ?", [order.id],
    )).resolves.toEqual([])
  })

  it("allows only one concurrent payment for the last seat and replays its event when full", async () => {
    // Given
    const catalog = await capacityCatalog(2)
    const paidOrder = await pendingOrder(catalog, "paid", 1)
    await pay(paidOrder).expect(201)
    const first = await pendingOrder(catalog, "first", 1)
    const second = await pendingOrder(catalog, "second", 1)
    const before = await availability(catalog).expect(200)

    // When
    const results = await Promise.all([pay(first), pay(second)])

    // Then
    expect(results.map((result) => result.status).sort()).toEqual([201, 409])
    expect(before.body).toMatchObject({ occupiedCapacity: 1, remainingCapacity: 1 })
    expect(results.find((result) => result.status === 409)?.body.code).toBe("tour_session_full")
    const available = await availability(catalog).expect(400)
    expect(available.body).toMatchObject({ capacity: 2, occupiedCapacity: 2, remainingCapacity: 0 })
    const winner = results[0]?.status === 201 ? first : second
    await pay(winner).expect(201)
    const summary = await request(app.getHttpServer()).get("/roster/summary").set(staffHeaders)
      .query({ tourSessionId: catalog.tourSessionId }).expect(200)
    expect(summary.body).toMatchObject({ paidHeadcount: 2, paidAmountFen: 25600 })
  })

  it("settles a waiting order after a partial refund releases a seat", async () => {
    // Given
    const catalog = await capacityCatalog(2)
    const paidOrder = await pendingOrder(catalog, "paid", 2)
    const waitingOrder = await pendingOrder(catalog, "waiting", 1)
    await pay(paidOrder).expect(201)
    const lines: readonly { readonly id: string }[] = await dataSource.query(
      "select id from order_lines where order_id = ? order by id limit 1", [paidOrder.id],
    )
    const refund = await request(app.getHttpServer()).post(`/staff/orders/${paidOrder.id}/refunds`).set(staffHeaders)
      .send({ lineIds: lines.map((line) => line.id), reason: "release a seat", idempotencyKey: `${scope}-release` }).expect(201)
    await request(app.getHttpServer()).post(`/staff/orders/${paidOrder.id}/refunds/${refund.body.id}/local-result`)
      .set(staffHeaders).send({ outcome: "succeeded" }).expect(201)

    // When
    await pay(waitingOrder).expect(201)

    // Then
    const available = await availability(catalog).expect(400)
    expect(available.body).toMatchObject({ capacity: 2, occupiedCapacity: 2, remainingCapacity: 0 })
  })

  async function capacityCatalog(capacity: number): Promise<CatalogFixture> {
    const catalog = await createCatalog(app, scope)
    await dataSource.query("update tour_sessions set capacity = ?, price_fen = 12800 where id = ?", [capacity, catalog.tourSessionId])
    return catalog
  }

  async function pendingOrder(catalog: CatalogFixture, family: string, participantCount: number): Promise<PendingOrder> {
    const headers = familyHeader(scope, family)
    const memberIds: string[] = []
    for (let index = 0; index < participantCount; index += 1) {
      const member = await createMember({
        app, scope, headers, catalog, displayName: `Capacity Child ${family} ${String.fromCharCode(65 + index)}`, codeSuffix: `${family[0]}${index}`,
      })
      memberIds.push(member.id)
    }
    const enrollment = await request(app.getHttpServer()).post("/enrollments").set(headers).send(enrollmentBody({
      catalog, memberIds, contactName: "Capacity Parent", emergencyContactName: "Capacity Contact", emergencyContactPhone: virtualPhone("1009"),
    })).expect(201)
    const fixture = { headers, enrollmentId: enrollment.body.id, tourSessionId: catalog.tourSessionId, participantIds: [] }
    const order = await createOrder(app, fixture, `${scope}-${family}`)
    await startMockPayment(app, fixture, order.id)
    return { ...order, headers }
  }

  function pay(order: PendingOrder) {
    return request(app.getHttpServer()).post("/payments/mock/events").set(order.headers).send(mockEventBody({
      eventId: `${order.id}-event`, transactionId: `${order.id}-transaction`, orderId: order.id, amountFen: order.amountFen, status: "succeeded",
    }))
  }

  function availability(catalog: CatalogFixture) {
    return request(app.getHttpServer()).get(`/tour-sessions/${catalog.tourSessionId}/enrollment-availability`)
      .query({ at: "2026-09-22T00:00:00.000Z" })
  }
})
