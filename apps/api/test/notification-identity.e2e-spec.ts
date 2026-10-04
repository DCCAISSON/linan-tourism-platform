import type { INestApplication } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { WechatFamilySessionEntity } from "../src/domain/entities/wechat-family-session.entity.js"
import { NotificationRecipientAuthorizationEntity } from "../src/domain/entities/notification-recipient-authorization.entity.js"
import { hashWechatIdentity, hashWechatSessionToken } from "../src/modules/wechat/wechat-session-token.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createOrder, createPaidEnrollmentFixture } from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Notification identity boundary", () => {
  let app: INestApplication
  beforeAll(async () => { await initializeCatalogTripDatabase(); app = await createCatalogTripApp() })
  afterAll(async () => { await app.close(); await closeCatalogTripDatabase() })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it("rejects unavailable WeChat subscriptions while preserving manual authorization and order isolation", async () => {
    const scope = randomUUID()
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "owner" })
    const order = await createOrder(app, fixture, scope)
    await dataSource.query("UPDATE orders SET status = 'paid', paid_fen = amount_fen WHERE id = ?", [order.id])
    const token = randomUUID()
    await dataSource.getRepository(WechatFamilySessionEntity).save({
      id: randomUUID(), organizationId: null, familyId: null, familyCode: `family-${scope}`,
      openidHash: hashWechatIdentity(scope), tokenHash: hashWechatSessionToken(token),
      expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
    })
    const body = { receiverName: "家长", relation: "guardian", idempotencyKey: "recipient" }

    const unavailable = await request(app.getHttpServer()).post(`/orders/${order.id}/notification-recipients`)
      .auth(token, { type: "bearer" }).send({ ...body, channel: "wechat_subscribe" }).expect(400)
    const manual = await request(app.getHttpServer()).post(`/orders/${order.id}/notification-recipients`)
      .auth(token, { type: "bearer" }).send({ ...body, channel: "manual" }).expect(201)

    expect(unavailable.body).toEqual(expect.objectContaining({ code: "subscriber_openid_unavailable", message: "微信订阅通知尚未接通，请选择人工通知" }))
    expect(manual.body).toEqual(expect.objectContaining({ channel: "manual", active: true }))
    expect(manual.body.subscriberOpenid).toBeUndefined()
    await request(app.getHttpServer()).post(`/orders/${order.id}/notification-recipients`)
      .set("x-linan-dev-family-identity", "another-family").send({ ...body, channel: "manual" }).expect(403)
  })

  it("persists only the code-verified OpenID and never returns it in family responses", async () => {
    const fixture = await subscriptionFixture(app)
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ openid: fixture.openid })))
    const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/notification-recipients`)
      .auth(fixture.token, { type: "bearer" }).send({ ...fixture.body, code: "own-fresh-code" }).expect(201)
    expect(response.body).toMatchObject({ channel: "wechat_subscribe", active: true })
    expect(response.body).not.toHaveProperty("subscriberOpenid")
    const saved = await dataSource.getRepository(NotificationRecipientAuthorizationEntity).findOneByOrFail({ id: response.body.id })
    expect(saved.subscriberOpenid).toBe(fixture.openid)
    expect(saved.familyActorId).toBe(hashWechatIdentity(fixture.openid))
    const overview = await request(app.getHttpServer()).get(`/orders/${fixture.orderId}/notifications`).auth(fixture.token, { type: "bearer" }).expect(200)
    expect(overview.body.subscribeTemplates).toEqual([])
    expect(JSON.stringify(overview.body)).not.toContain(fixture.openid)
  })

  it("rejects another user's code, developer identities, and claimed OpenIDs before saving", async () => {
    const fixture = await subscriptionFixture(app)
    const exchange = vi.fn(async () => Response.json({ openid: "another-wechat-user" }))
    vi.stubGlobal("fetch", exchange)
    const mismatch = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/notification-recipients`)
      .auth(fixture.token, { type: "bearer" }).send({ ...fixture.body, code: "other-code" }).expect(401)
    expect(mismatch.body.code).toBe("wechat_identity_mismatch")
    await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/notification-recipients`)
      .set("x-linan-dev-family-identity", fixture.familyCode).send({ ...fixture.body, code: "other-code" }).expect(401)
    for (const extra of [{ openid: fixture.openid }, { subscriberOpenid: fixture.openid }, { subscribed: true }, { actorId: hashWechatIdentity(fixture.openid) }]) {
      await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/notification-recipients`)
        .auth(fixture.token, { type: "bearer" }).send({ ...fixture.body, code: "other-code", ...extra }).expect(400)
    }
    expect(exchange).toHaveBeenCalledTimes(1)
    expect(await dataSource.getRepository(NotificationRecipientAuthorizationEntity).countBy({ orderId: fixture.orderId })).toBe(0)
  })

  it("keeps business subscription unavailable when sending is disabled", async () => {
    const fixture = await subscriptionFixture(app)
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ openid: fixture.openid })))
    const response = await request(app.getHttpServer()).post(`/orders/${fixture.orderId}/notification-recipients`)
      .auth(fixture.token, { type: "bearer" }).send({ ...fixture.body, code: "own-code" }).expect(400)
    expect(response.body.code).toBe("wechat_subscribe_unconfigured")
    expect(await dataSource.getRepository(NotificationRecipientAuthorizationEntity).countBy({ orderId: fixture.orderId })).toBe(0)
  })
})

async function subscriptionFixture(app: INestApplication) {
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "true")
  vi.stubEnv("WECHAT_SUBSCRIBE_API_ORIGIN", "https://api.weixin.qq.com")
  vi.stubEnv("WECHAT_MINIAPP_APP_ID", "fixture-app")
  vi.stubEnv("WECHAT_MINIAPP_APP_SECRET", "fixture-secret")
  const scope = randomUUID()
  const fixture = await createPaidEnrollmentFixture({ app, scope, family: "owner" })
  const order = await createOrder(app, fixture, scope)
  await dataSource.query("UPDATE orders SET status = 'paid', paid_fen = amount_fen WHERE id = ?", [order.id])
  const token = randomUUID()
  const openid = `wechat-${scope}`
  const familyCode = `family-${scope}`
  await dataSource.getRepository(WechatFamilySessionEntity).save({ id: randomUUID(), organizationId: null, familyId: null, familyCode,
    openidHash: hashWechatIdentity(openid), tokenHash: hashWechatSessionToken(token), expiresAt: new Date(Date.now() + 60000), revokedAt: null })
  return { token, openid, familyCode, orderId: order.id, body: { receiverName: "家长", relation: "guardian", channel: "wechat_subscribe", idempotencyKey: "recipient" } }
}
