import { randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { continuationHeaders, createContinuationActor } from "./business-continuation-fixture.js"
import { createOrder, createPaidEnrollmentFixture } from "./mock-payment-fixture.js"
import { WechatSubscribeAdapter } from "../src/modules/notifications/wechat-subscribe.adapter.js"

describe.skipIf(databaseUrl === undefined)("Confirmed notification forms and media boundaries", () => {
  let app: INestApplication
  beforeAll(async () => { await initializeCatalogTripDatabase(); app = await createCatalogTripApp() })
  beforeEach(() => { vi.stubEnv("ADMIN_WEB_ORIGIN", "http://127.0.0.1:5174"); vi.stubEnv("NODE_ENV", "development") })
  afterAll(async () => { await app.close(); await closeCatalogTripDatabase() })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it("offers scoped names and authorized recipients, restores fields, rejects cross-session and revoked targets", async () => {
    const f = await fixture(app)
    const other = await fixture(app)
    const outbound = vi.spyOn(app.get(WechatSubscribeAdapter), "send").mockRejectedValue(new Error("Real notification network calls are forbidden"))
    const sessions = await request(app.getHttpServer()).get("/staff/notifications/sessions").set(f.headers).expect(200)
    expect(sessions.body).toEqual([expect.objectContaining({ id: f.sessionId, label: expect.any(String) })])
    const options = await request(app.getHttpServer()).get(`/staff/notifications/sessions/${f.sessionId}/recipients`).set(f.headers).expect(200)
    expect(options.body).toEqual([expect.objectContaining({ authorizationId: f.authorizationId, receiverName: "验收接收人" })])
    expect(JSON.stringify(options.body)).not.toMatch(/openid|familyActorId|idempotencyKey/i)
    await request(app.getHttpServer()).get(`/staff/notifications/sessions/${other.sessionId}/recipients`).set(f.headers).expect(403)
    const createdAfter = Date.now()
    const content = await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/content-versions`).set(f.headers)
      .send({ title: "集合通知", bodyText: "请准时到校", templateId: null, miniappPage: null, templateData: { thing3: { value: "学校南门" } } }).expect(201)
    const reloaded = await request(app.getHttpServer()).get(`/staff/notifications/sessions/${f.sessionId}`).set(f.headers).expect(200)
    expect(reloaded.body.contents[0].templateData).toEqual({ thing3: { value: "学校南门" } })
    expect(Date.parse(content.body.createdAt)).toBeGreaterThanOrEqual(createdAfter)
    expect(Date.parse(reloaded.body.contents[0].createdAt)).toBeGreaterThanOrEqual(createdAfter)
    const taskBody = { contentVersionId: content.body.id, authorizationIds: [f.authorizationId], idempotencyKey: randomUUID() }
    await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/preview`).set(f.headers).send({ authorizationIds: [other.authorizationId] }).expect(409)
    await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/tasks`).set(f.headers).send({ ...taskBody, authorizationIds: [other.authorizationId] }).expect(409)
    const created = await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/tasks`).set(f.headers).send(taskBody).expect(201)
    expect(Date.parse(created.body.createdAt)).toBeGreaterThanOrEqual(createdAfter)
    const repeated = await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/tasks`).set(f.headers).send(taskBody).expect(201)
    expect(repeated.body.id).toBe(created.body.id)
    await request(app.getHttpServer()).post(`/orders/${f.orderId}/notification-recipients/${f.authorizationId}/withdraw`).set(f.familyHeaders).send({ expectedVersion: 1 }).expect(201)
    await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/tasks`).set(f.headers).send({ ...taskBody, idempotencyKey: randomUUID() }).expect(409)
    const result = await request(app.getHttpServer()).post(`/staff/notifications/tasks/${created.body.id}/send`).set(f.headers).expect(201)
    expect(result.body.attempts[0].errorCode).toBe("authorization_withdrawn")
    expect(outbound).not.toHaveBeenCalled()
  })

  it("separates notification read, write and send permissions", async () => {
    const f = await fixture(app)
    const reader = await createContinuationActor(app, f.scope, "reader", ["notifications.read"], { kind: "tour_session", id: f.sessionId })
    const headers = continuationHeaders(reader)
    const response = await request(app.getHttpServer()).get(`/staff/notifications/sessions/${f.sessionId}`).set(headers).expect(200)
    expect(response.body).toMatchObject({ canWrite: false, canSend: false })
    await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/content-versions`).set(headers).send({ title: "通知", bodyText: "内容", templateId: null, miniappPage: null, templateData: {} }).expect(403)
    const content = await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/content-versions`).set(f.headers).send({ title: "通知", bodyText: "内容", templateId: null, miniappPage: null, templateData: {} }).expect(201)
    const input = { contentVersionId: content.body.id, authorizationIds: [f.authorizationId], idempotencyKey: randomUUID() }
    await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/tasks`).set(headers).send(input).expect(403)
    const task = await request(app.getHttpServer()).post(`/staff/notifications/sessions/${f.sessionId}/tasks`).set(f.headers).send(input).expect(201)
    await request(app.getHttpServer()).post(`/staff/notifications/tasks/${task.body.id}/send`).set(headers).expect(403)
  })

  it("keeps third-party album access within the order and removes disabled entries", async () => {
    const f = await fixture(app)
    const other = await fixture(app)
    const path = `/staff/media/sessions/${f.sessionId}/providers`
    const publisher = await createContinuationActor(app, f.scope, "publisher", ["media.read", "media.publish"], { kind: "all", id: null })
    const mediaHeaders = continuationHeaders(publisher)
    const input = { kind: "album", label: "活动相册", url: "https://album.example.test/controlled", enabled: true, expectedVersion: 0 }
    await request(app.getHttpServer()).patch(path).set(f.headers).send(input).expect(403)
    await request(app.getHttpServer()).patch(path).set(mediaHeaders).send({ ...input, url: "https://user:pass@album.example.test/a" }).expect(400)
    await request(app.getHttpServer()).patch(path).set(mediaHeaders).send(input).expect(200)
    const own = await request(app.getHttpServer()).get(`/orders/${f.orderId}/media`).set(f.familyHeaders).expect(200)
    expect(own.body.providers).toEqual([expect.objectContaining({ url: input.url })])
    await request(app.getHttpServer()).get(`/orders/${f.orderId}/media`).set(other.familyHeaders).expect(403)
    await request(app.getHttpServer()).patch(path).set(mediaHeaders).send({ ...input, enabled: false, expectedVersion: 1 }).expect(200)
    const disabled = await request(app.getHttpServer()).get(`/orders/${f.orderId}/media`).set(f.familyHeaders).expect(200)
    expect(disabled.body.providers).toEqual([])
  })
})

async function fixture(app: INestApplication) {
  const scope = `nm-${randomUUID().slice(0, 8)}`
  const family = await createPaidEnrollmentFixture({ app, scope, family: "owner" })
  const order = await createOrder(app, family, scope)
  await dataSource.query("UPDATE orders SET status='paid', paid_fen=amount_fen WHERE id=?", [order.id])
  const actor = await createContinuationActor(app, scope, "operator", ["notifications.read", "notifications.write", "notifications.send", "media.read", "media.publish"], { kind: "tour_session", id: family.tourSessionId })
  const authorization = await request(app.getHttpServer()).post(`/orders/${order.id}/notification-recipients`).set(family.headers).send({ receiverName: "验收接收人", relation: "guardian", channel: "manual", idempotencyKey: randomUUID() }).expect(201)
  return { scope, sessionId: family.tourSessionId, orderId: order.id, headers: continuationHeaders(actor), familyHeaders: family.headers, authorizationId: String(authorization.body.id) }
}
