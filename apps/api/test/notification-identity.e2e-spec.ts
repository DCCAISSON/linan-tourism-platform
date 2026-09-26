import type { INestApplication } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { WechatFamilySessionEntity } from "../src/domain/entities/wechat-family-session.entity.js"
import { hashWechatIdentity, hashWechatSessionToken } from "../src/modules/wechat/wechat-session-token.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createOrder, createPaidEnrollmentFixture } from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Notification identity boundary", () => {
  let app: INestApplication
  beforeAll(async () => { await initializeCatalogTripDatabase(); app = await createCatalogTripApp() })
  afterAll(async () => { await app.close(); await closeCatalogTripDatabase() })

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
})
