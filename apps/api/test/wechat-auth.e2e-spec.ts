import type { INestApplication } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { hashWechatIdentity } from "../src/modules/wechat/wechat-session-token.js"
import { createOrder, createPaidEnrollmentFixture } from "./mock-payment-fixture.js"

describe.skipIf(databaseUrl === undefined)("Consumer WeChat login", () => {
  let app: INestApplication
  let openid: string
  beforeAll(initializeCatalogTripDatabase)
  beforeEach(async () => {
    openid = randomUUID()
    vi.stubEnv("WECHAT_MINIAPP_APP_ID", "test-app")
    vi.stubEnv("WECHAT_MINIAPP_APP_SECRET", "test-secret")
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ openid })))
    app = await createCatalogTripApp()
  })
  afterEach(async () => { await app.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
  afterAll(closeCatalogTripDatabase)

  it("creates a private identity when a new user supplies only a WeChat code", async () => {
    // Given / When
    const result = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "new" }).expect(201)
    // Then
    expect(result.body).toEqual({ token: expect.any(String), familyCode: expect.any(String), expiresAt: expect.any(String) })
    await request(app.getHttpServer()).get("/orders").auth(result.body.token, { type: "bearer" }).expect(200, [])
  })

  it("retains identity when sessions expire and the user logs out", async () => {
    // Given
    const first = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "first" }).expect(201)
    await dataSource.query("UPDATE wechat_family_sessions SET expires_at = '2000-01-01' WHERE openid_hash = ?", [hashWechatIdentity(openid)])
    const second = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "second" }).expect(201)
    await request(app.getHttpServer()).post("/wechat/miniapp/logout").auth(second.body.token, { type: "bearer" }).expect(201)
    // When
    const third = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "third" }).expect(201)
    // Then
    expect(second.body.familyCode).toBe(first.body.familyCode)
    expect(third.body.familyCode).toBe(first.body.familyCode)
    await request(app.getHttpServer()).get("/orders").auth(second.body.token, { type: "bearer" }).expect(401)
  })

  it("uses one identity when first login requests arrive concurrently", async () => {
    // Given / When
    const results = await Promise.all(Array.from({ length: 8 }, () => request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "parallel" }).expect(201)))
    // Then
    expect(new Set(results.map((result) => result.body.familyCode)).size).toBe(1)
    expect(new Set(results.map((result) => result.body.token)).size).toBe(8)
  })

  it("keeps identities distinct when another user supplies the same phone and family code", async () => {
    // Given
    const first = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "owner", phone: "13800000000" }).expect(201)
    openid = randomUUID()
    // When
    const second = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "other", phone: "13800000000", familyCode: first.body.familyCode }).expect(201)
    // Then
    expect(second.body.familyCode).not.toBe(first.body.familyCode)
    await request(app.getHttpServer()).post("/wechat/miniapp/bind").send({ code: "claim", familyCode: first.body.familyCode }).expect(401)
    await request(app.getHttpServer()).post("/wechat/miniapp/rebind").auth(second.body.token, { type: "bearer" }).send({ code: "claim", familyCode: first.body.familyCode }).expect(401)
  })

  it("fails without real configured credentials", async () => {
    // Given
    vi.stubEnv("WECHAT_MINIAPP_APP_SECRET", "")
    // When
    const result = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "new" }).expect(400)
    // Then
    expect(result.body.code).toBe("wechat_login_unconfigured")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("recovers own historical orders after login while excluding another identity", async () => {
    const first = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "owner" }).expect(201)
    const scope = randomUUID()
    const fixture = await createPaidEnrollmentFixture({ app, scope, family: "owner" })
    const order = await createOrder(app, fixture, scope)
    await dataSource.query("UPDATE families SET code = ? WHERE code = ?", [first.body.familyCode, `family-${scope}`])
    await request(app.getHttpServer()).post("/wechat/miniapp/logout").auth(first.body.token, { type: "bearer" }).expect(201)

    const recovered = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "owner-again" }).expect(201)
    const own = await request(app.getHttpServer()).get("/orders").auth(recovered.body.token, { type: "bearer" }).expect(200)

    expect(own.body).toEqual([expect.objectContaining({ id: order.id })])
    openid = randomUUID()
    const other = await request(app.getHttpServer()).post("/wechat/miniapp/login").send({ code: "other" }).expect(201)
    await request(app.getHttpServer()).get("/orders").auth(other.body.token, { type: "bearer" }).expect(200, [])
    await request(app.getHttpServer()).get(`/orders/${order.id}/detail`).auth(other.body.token, { type: "bearer" }).expect(404)
  })
})
