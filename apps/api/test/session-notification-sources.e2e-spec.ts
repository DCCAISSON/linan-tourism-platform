import { randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { continuationHeaders, createContinuationActor } from "./business-continuation-fixture.js"
import { createOrder, createPaidEnrollmentFixture } from "./mock-payment-fixture.js"
import { NotificationBusinessSourceEntity } from "../src/domain/entities/notification-business-source.entity.js"
import { EnrollmentEntity } from "../src/domain/entities/enrollment.entity.js"
import { OrderEntity } from "../src/domain/entities/order.entity.js"
import { PretripConfigEntity } from "../src/domain/entities/pretrip-config.entity.js"
import { TourSessionEntity } from "../src/domain/entities/tour-session.entity.js"
import { recordOrderNotificationSource, recordPretripNotificationSource } from "../src/modules/notifications/notification-business-source.js"
import { WechatSubscribeAdapter } from "../src/modules/notifications/wechat-subscribe.adapter.js"

describe.skipIf(databaseUrl === undefined)("session business notification sources", () => {
  let app: INestApplication
  beforeAll(async () => { await initializeCatalogTripDatabase(); app = await createCatalogTripApp() })
  beforeEach(() => { vi.stubEnv("ADMIN_WEB_ORIGIN", "http://127.0.0.1:5174"); vi.stubEnv("NODE_ENV", "development") })
  afterAll(async () => { await app.close(); await closeCatalogTripDatabase() })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it("keeps one unpaid order source and rolls back a source with its enclosing transaction", async () => {
    const f = await fixture(app, false)
    const session = await dataSource.manager.findOneByOrFail(TourSessionEntity, { id: f.sessionId })
    const order = await dataSource.manager.findOneByOrFail(OrderEntity, { id: f.orderId })
    await dataSource.transaction(async manager => { await recordOrderNotificationSource(manager, { session, order }) })
    expect(await dataSource.manager.countBy(NotificationBusinessSourceEntity, { orderId: order.id })).toBe(1)
    const response = await request(app.getHttpServer()).get(f.path).set(f.headers).expect(200)
    expect(response.body.sources).toEqual([expect.objectContaining({ status: "awaiting_authorization" })])
    const config = Object.assign(new PretripConfigEntity(), { tourSessionId: session.id, version: 999 })
    await expect(dataSource.transaction(async manager => {
      await recordPretripNotificationSource(manager, { session, config })
      throw new Error("rollback fixture")
    })).rejects.toThrow("rollback fixture")
    expect(await dataSource.manager.countBy(NotificationBusinessSourceEntity, { sessionId: session.id, sourceVersion: 999 })).toBe(0)
  })

  it("rejects another paid order in the same session and reuses a source task atomically", async () => {
    const f = await fixture(app)
    const source = await dataSource.manager.findOneByOrFail(NotificationBusinessSourceEntity, { orderId: f.orderId })
    const enrollment = await dataSource.manager.findOneByOrFail(EnrollmentEntity, { id: f.enrollmentId })
    const order = await dataSource.manager.findOneByOrFail(OrderEntity, { id: f.orderId })
    const otherEnrollment = await dataSource.manager.save(Object.assign(new EnrollmentEntity(), enrollment, { id: randomUUID(), code: randomUUID() }))
    const otherOrder = await dataSource.manager.save(Object.assign(new OrderEntity(), order, { id: randomUUID(), code: randomUUID(), enrollmentId: otherEnrollment.id, requestIdempotencyKey: randomUUID() }))
    const otherAuth = await authorize(app, otherOrder.id, f.familyHeaders)
    const body = { contentVersionId: f.contentId, authorizationIds: [f.authorizationId], sourceId: source.id, idempotencyKey: randomUUID() }
    await request(app.getHttpServer()).post(`${f.path}/preview`).set(f.headers).send({ authorizationIds: [otherAuth], sourceId: source.id }).expect(409)
    await request(app.getHttpServer()).post(`${f.path}/tasks`).set(f.headers).send({ ...body, authorizationIds: [otherAuth] }).expect(409)
    const results = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(`${f.path}/tasks`).set(f.headers).send({ ...body, idempotencyKey: randomUUID() }).expect(201)))
    expect(results[0]?.body.id).toBe(results[1]?.body.id)
    for (const result of results) expect(result.body.targets).toHaveLength(1)
    expect((await dataSource.manager.findOneByOrFail(NotificationBusinessSourceEntity, { id: source.id })).linkedTaskId).toBe(results[0]?.body.id)
  })

  it("does not reuse a manual task idempotency key for a business source", async () => {
    const f = await fixture(app)
    const source = await dataSource.manager.findOneByOrFail(NotificationBusinessSourceEntity, { orderId: f.orderId })
    const body = { contentVersionId: f.contentId, authorizationIds: [f.authorizationId], idempotencyKey: randomUUID() }
    await request(app.getHttpServer()).post(`${f.path}/tasks`).set(f.headers).send(body).expect(201)
    await request(app.getHttpServer()).post(`${f.path}/tasks`).set(f.headers).send({ ...body, sourceId: source.id }).expect(409)
  })

  it("marks older pretrip sources expired and prevents their task from sending", async () => {
    const f = await fixture(app)
    const outbound = vi.spyOn(app.get(WechatSubscribeAdapter), "send").mockRejectedValue(new Error("network forbidden"))
    const first = await pretripSource(f.sessionId, f.actorId, 1)
    const task = await request(app.getHttpServer()).post(`${f.path}/tasks`).set(f.headers).send({ contentVersionId: f.contentId, authorizationIds: [f.authorizationId], sourceId: first.id, idempotencyKey: randomUUID() }).expect(201)
    await pretripSource(f.sessionId, f.actorId, 2)
    const response = await request(app.getHttpServer()).get(f.path).set(f.headers).expect(200)
    expect(response.body.sources).toContainEqual(expect.objectContaining({ id: first.id, status: "expired" }))
    await request(app.getHttpServer()).post(`${f.path}/preview`).set(f.headers).send({ sourceId: first.id, authorizationIds: [f.authorizationId] }).expect(409)
    const result = await request(app.getHttpServer()).post(`/staff/notifications/tasks/${task.body.id}/send`).set(f.headers).expect(201)
    expect(result.body.attempts[0].errorCode).toBe("notification_source_expired")
    expect(outbound).not.toHaveBeenCalled()
  })

  it.each(["refunded", "cancelled"] as const)("blocks business dispatch after order becomes %s", async status => {
    const f = await fixture(app)
    const source = await pretripSource(f.sessionId, f.actorId, 1)
    const outbound = vi.spyOn(app.get(WechatSubscribeAdapter), "send").mockRejectedValue(new Error("network forbidden"))
    const task = await request(app.getHttpServer()).post(`${f.path}/tasks`).set(f.headers).send({ contentVersionId: f.contentId, authorizationIds: [f.authorizationId], sourceId: source.id, idempotencyKey: randomUUID() }).expect(201)
    await dataSource.manager.update(OrderEntity, { id: f.orderId }, { status })
    const result = await request(app.getHttpServer()).post(`/staff/notifications/tasks/${task.body.id}/send`).set(f.headers).expect(201)
    expect(result.body.attempts[0].errorCode).toBe("notification_order_ineligible")
    const retry = await request(app.getHttpServer()).post(`/staff/notifications/tasks/${task.body.id}/retry`).set(f.headers).expect(201)
    expect(retry.body.attempts).toHaveLength(1)
    expect(outbound).not.toHaveBeenCalled()
  })
})

async function fixture(app: INestApplication, paid = true) {
  const scope = `ns-${randomUUID().slice(0, 8)}`
  const family = await createPaidEnrollmentFixture({ app, scope, family: "owner" })
  const order = await createOrder(app, family, scope)
  const actor = await createContinuationActor(app, scope, "operator", ["notifications.read", "notifications.write", "notifications.send"], { kind: "tour_session", id: family.tourSessionId })
  const headers = continuationHeaders(actor)
  if (paid) await dataSource.manager.update(OrderEntity, { id: order.id }, { status: "paid", paidFen: order.amountFen })
  const authorizationId = paid ? await authorize(app, order.id, family.headers) : ""
  const path = `/staff/notifications/sessions/${family.tourSessionId}`
  const content = await request(app.getHttpServer()).post(`${path}/content-versions`).set(headers).send({ title: "业务通知", bodyText: "请查看安排", templateId: null, miniappPage: null, templateData: {} }).expect(201)
  return { path, headers, familyHeaders: family.headers, sessionId: family.tourSessionId, enrollmentId: family.enrollmentId, orderId: order.id, authorizationId, contentId: String(content.body.id), actorId: actor.id }
}

async function authorize(app: INestApplication, orderId: string, headers: Readonly<Record<string, string>>): Promise<string> {
  const result = await request(app.getHttpServer()).post(`/orders/${orderId}/notification-recipients`).set(headers).send({ receiverName: "业务接收人", relation: "guardian", channel: "manual", idempotencyKey: randomUUID() }).expect(201)
  return String(result.body.id)
}

async function pretripSource(sessionId: string, actorId: string, version: number) {
  await dataSource.transaction(async manager => {
    const session = await manager.findOneOrFail(TourSessionEntity, { where: { id: sessionId }, lock: { mode: "pessimistic_write" } })
    const config = manager.create(PretripConfigEntity, { tourSessionId: sessionId, updatedByStaffId: actorId, version, gatheringPlace: "学校门口" })
    await manager.save(config)
    await recordPretripNotificationSource(manager, { session, config })
    await recordPretripNotificationSource(manager, { session, config })
  })
  return dataSource.manager.findOneByOrFail(NotificationBusinessSourceEntity, { sessionId, kind: "pretrip_updated", sourceVersion: version })
}
