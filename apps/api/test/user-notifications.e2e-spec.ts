import type { INestApplication } from "@nestjs/common"
import { randomUUID } from "node:crypto"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { In } from "typeorm"
import { WechatFamilySessionEntity } from "../src/domain/entities/wechat-family-session.entity.js"
import { UserNotificationTemplateEntity as Template, UserNotificationSubscriptionEntity as Subscription,
  UserNotificationTaskEntity as Task, UserNotificationTargetEntity as Target, UserNotificationAttemptEntity as Attempt } from "../src/domain/entities/user-notification.entity.js"
import { WechatSubscribeAdapter } from "../src/modules/notifications/wechat-subscribe.adapter.js"
import { hashWechatIdentity, hashWechatSessionToken } from "../src/modules/wechat/wechat-session-token.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, DEV_ADMIN_HEADERS, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"

const fields = [{ key: "thing1", label: "产品名称", rule: "thing" }, { key: "number2", label: "上架数量", rule: "number" }, { key: "thing3", label: "备注信息", rule: "thing" }]
const payload = { thing1: "秋日山野行", number2: "1", thing3: "欢迎查看活动详情" }
const templateIds: string[] = []
const sessionIds: string[] = []

describe.skipIf(databaseUrl === undefined)("user notifications without orders", () => {
  let app: INestApplication
  beforeAll(async () => { await initializeCatalogTripDatabase(); app = await createCatalogTripApp() }, 60_000)
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  afterAll(async () => {
    if (templateIds.length > 0) {
      const tasks = await dataSource.manager.findBy(Task, { templateId: In(templateIds) })
      if (tasks.length > 0) {
        await dataSource.manager.delete(Attempt, { taskId: In(tasks.map(task => task.id)) })
        await dataSource.manager.delete(Target, { taskId: In(tasks.map(task => task.id)) })
        await dataSource.manager.delete(Task, { id: In(tasks.map(task => task.id)) })
      }
      await dataSource.manager.delete(Subscription, { templateId: In(templateIds) })
      await dataSource.manager.delete(Template, { id: In(templateIds) })
    }
    if (sessionIds.length > 0) await dataSource.manager.delete(WechatFamilySessionEntity, { id: In(sessionIds) })
    await app?.close(); await closeCatalogTripDatabase()
  })

  async function fixture() {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("WECHAT_MINIAPP_APP_ID", "fixture-app")
    vi.stubEnv("WECHAT_MINIAPP_APP_SECRET", "fixture-secret")
    const id = randomUUID(), token = randomUUID(), openid = `qa-${randomUUID()}`
    const templateId = `template-${randomUUID()}`
    templateIds.push(id)
    sessionIds.push(token)
    await dataSource.manager.save(WechatFamilySessionEntity, { id: token, organizationId: null, familyId: null,
      familyCode: `consumer-${token}`, openidHash: hashWechatIdentity(openid), tokenHash: hashWechatSessionToken(token), expiresAt: new Date(Date.now() + 600_000) })
    await request(app.getHttpServer()).put(`/staff/user-notifications/templates/${id}`).set(DEV_ADMIN_HEADERS)
      .send({ title: "新活动通知", category: "旅游产品上架通知", templateId, type: "once", fields, enabled: true }).expect(200)
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ openid })))
    return { id, token, openid, templateId }
  }
  async function subscribe(f: Awaited<ReturnType<typeof fixture>>) {
    await request(app.getHttpServer()).post("/user-notifications/subscriptions").auth(f.token, { type: "bearer" })
      .send({ code: randomUUID(), outcomes: [{ templateId: f.templateId, result: "accept" }] }).expect(201)
    return dataSource.manager.findOneByOrFail(Subscription, { templateId: f.id, actorId: hashWechatIdentity(f.openid) })
  }
  async function createTask(f: Awaited<ReturnType<typeof fixture>>, sub: Subscription, key = randomUUID()) {
    const body = { templateId: f.id, subscriberIds: [sub.id], idempotencyKey: key, payload, page: "pages/home/index" }
    const response = await request(app.getHttpServer()).post("/staff/user-notifications/tasks").set(DEV_ADMIN_HEADERS).send(body).expect(201)
    return { response, body, task: await dataSource.manager.findOneByOrFail(Task, { idempotencyKey: key }) }
  }
  function sender() {
    return vi.spyOn(app.get(WechatSubscribeAdapter), "send").mockResolvedValue({ status: "api_accepted", errorCode: null, providerMessage: "ok", retryable: false })
  }

  it("accepts a verified user with no family/order and never exposes OpenID", async () => {
    const f = await fixture()
    const sub = await subscribe(f)
    expect(sub).toMatchObject({ openid: f.openid, actorId: hashWechatIdentity(f.openid), status: "active", version: 1 })
    const response = await request(app.getHttpServer()).get("/user-notifications").auth(f.token, { type: "bearer" }).expect(200)
    expect(JSON.stringify(response.body)).not.toContain(f.openid)
    expect(response.body.templates).toContainEqual(expect.objectContaining({ id: f.id, subscription: { id: sub.id, status: "active", version: 1 } }))
  })

  it("rejects missing login, wrong code identity and client OpenID", async () => {
    const f = await fixture()
    await request(app.getHttpServer()).get("/user-notifications").expect(401)
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ openid: "other-user" })))
    const body = { code: "wrong", outcomes: [{ templateId: f.templateId, result: "accept" }] }
    await request(app.getHttpServer()).post("/user-notifications/subscriptions").auth(f.token, { type: "bearer" }).send(body).expect(401)
    await request(app.getHttpServer()).post("/user-notifications/subscriptions").auth(f.token, { type: "bearer" }).send({ ...body, openid: f.openid }).expect(400)
    await request(app.getHttpServer()).post("/user-notifications/subscriptions").set("x-linan-dev-family-identity", "consumer").send(body).expect(401)
    expect(await dataSource.manager.countBy(Subscription, { templateId: f.id })).toBe(0)
  })

  it("keeps rejected popup outcomes inactive and excludes them from preview", async () => {
    const f = await fixture()
    await request(app.getHttpServer()).post("/user-notifications/subscriptions").auth(f.token, { type: "bearer" })
      .send({ code: "code", outcomes: [{ templateId: f.templateId, result: "reject" }] }).expect(201)
    const preview = await request(app.getHttpServer()).post("/staff/user-notifications/preview").set(DEV_ADMIN_HEADERS).send({ templateId: f.id }).expect(201)
    expect(preview.body).toEqual({ subscribers: [], eligibleCount: 0 })
  })

  it("records mixed popup outcomes without activating a rejected template", async () => {
    const f = await fixture(), second = await fixture()
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ openid: f.openid })))
    await request(app.getHttpServer()).post("/user-notifications/subscriptions").auth(f.token, { type: "bearer" })
      .send({ code: "mixed", outcomes: [{ templateId: f.templateId, result: "accept" }, { templateId: second.templateId, result: "reject" }] }).expect(201)
    const rows = await dataSource.manager.findBy(Subscription, { actorId: hashWechatIdentity(f.openid) })
    expect(rows.find(row => row.templateId === f.id)?.status).toBe("active")
    expect(rows.find(row => row.templateId === second.id)?.status).toBe("rejected")
  })

  it("rejects scoped staff and users without notification permission", async () => {
    const f = await fixture()
    await request(app.getHttpServer()).get("/staff/user-notifications/templates")
      .set({ "x-linan-dev-staff-id": "school", "x-linan-dev-staff-role": "school", "x-linan-dev-staff-school-id": "one" }).expect(403)
    await request(app.getHttpServer()).post("/staff/user-notifications/preview")
      .set({ "x-linan-dev-staff-id": "finance", "x-linan-dev-staff-role": "finance" }).send({ templateId: f.id }).expect(403)
  })

  it("blocks a withdrawn old task even after a fresh acceptance", async () => {
    const f = await fixture(), sub = await subscribe(f), task = await createTask(f, sub), send = sender()
    await request(app.getHttpServer()).post(`/user-notifications/subscriptions/${sub.id}/withdraw`).auth(f.token, { type: "bearer" }).send({ expectedVersion: sub.version }).expect(201)
    await subscribe(f)
    const response = await request(app.getHttpServer()).post(`/staff/user-notifications/tasks/${task.task.id}/send`).set(DEV_ADMIN_HEADERS).expect(201)
    expect(response.body.targets[0].status).toBe("blocked")
    expect(send).not.toHaveBeenCalled()
  })

  it("retains idempotent immutable snapshots and rejects key reuse with other content", async () => {
    const f = await fixture(), sub = await subscribe(f), task = await createTask(f, sub)
    const again = await request(app.getHttpServer()).post("/staff/user-notifications/tasks").set(DEV_ADMIN_HEADERS).send(task.body).expect(201)
    expect(again.body.task.id).toBe(task.task.id)
    await request(app.getHttpServer()).post("/staff/user-notifications/tasks").set(DEV_ADMIN_HEADERS)
      .send({ ...task.body, payload: { ...payload, thing1: "其他活动" } }).expect(409)
    expect(task.task.payloadSnapshot.data).toEqual(Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, { value }])))
  })

  it("preserves pending tasks when an already active user accepts again", async () => {
    const f = await fixture(), sub = await subscribe(f), task = await createTask(f, sub), send = sender()
    expect(await subscribe(f)).toMatchObject({ status: "active", version: sub.version })
    const response = await request(app.getHttpServer()).post(`/staff/user-notifications/tasks/${task.task.id}/send`).set(DEV_ADMIN_HEADERS).expect(201)
    expect(response.body.targets[0].status).toBe("api_accepted")
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("claims a once grant only once across concurrent tasks and duplicate sends", async () => {
    const f = await fixture(), sub = await subscribe(f), first = await createTask(f, sub), second = await createTask(f, sub), send = sender()
    await Promise.all([first, first, second].map(item => request(app.getHttpServer()).post(`/staff/user-notifications/tasks/${item.task.id}/send`).set(DEV_ADMIN_HEADERS).expect(201)))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ openid: f.openid, templateId: f.templateId, data: first.task.payloadSnapshot.data }))
    expect(await dataSource.manager.countBy(Attempt, { taskId: In([first.task.id, second.task.id]) })).toBe(2)
    const detail = await request(app.getHttpServer()).get(`/staff/user-notifications/tasks/${first.task.id}`).set(DEV_ADMIN_HEADERS).expect(200)
    expect(JSON.stringify(detail.body)).not.toContain(f.openid)
  })

  it("keeps uncertain outcomes for manual review without resending", async () => {
    const f = await fixture(), sub = await subscribe(f), task = await createTask(f, sub)
    const send = sender().mockResolvedValue({ status: "manual_required", errorCode: "wechat_transport_unknown", providerMessage: "unknown", retryable: false })
    await request(app.getHttpServer()).post(`/staff/user-notifications/tasks/${task.task.id}/send`).set(DEV_ADMIN_HEADERS).expect(201)
    const again = await request(app.getHttpServer()).post(`/staff/user-notifications/tasks/${task.task.id}/send`).set(DEV_ADMIN_HEADERS).expect(201)
    expect(send).toHaveBeenCalledTimes(1)
    expect(again.body.task.status).toBe("manual_required")
    expect(again.body.attempts[0]).toMatchObject({ status: "unknown", errorCode: "wechat_transport_unknown" })
  })

  it("rejects withdrawal once dispatch has already claimed the subscription", async () => {
    const f = await fixture(), sub = await subscribe(f), task = await createTask(f, sub)
    let markStarted: () => void = () => undefined
    let release: () => void = () => undefined
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const send = sender().mockImplementation(async () => {
      markStarted(); await gate
      return { status: "api_accepted", errorCode: null, providerMessage: "ok", retryable: false }
    })
    const sending = request(app.getHttpServer()).post(`/staff/user-notifications/tasks/${task.task.id}/send`).set(DEV_ADMIN_HEADERS).then(response => response)
    await started
    try {
      await request(app.getHttpServer()).post(`/user-notifications/subscriptions/${sub.id}/withdraw`).auth(f.token, { type: "bearer" }).send({ expectedVersion: sub.version }).expect(409)
    } finally { release() }
    expect((await sending).status).toBe(201)
    expect(send).toHaveBeenCalledTimes(1)
    expect(await dataSource.manager.findOneByOrFail(Subscription, { id: sub.id })).toMatchObject({ status: "consumed", version: 1 })
  })

  it("records a rejected recipient and requires a new acceptance", async () => {
    const f = await fixture(), sub = await subscribe(f), task = await createTask(f, sub)
    sender().mockResolvedValue({ status: "undelivered", errorCode: "43101", providerMessage: "refused", retryable: false })
    const response = await request(app.getHttpServer()).post(`/staff/user-notifications/tasks/${task.task.id}/send`).set(DEV_ADMIN_HEADERS).expect(201)
    expect(response.body.targets[0].status).toBe("rejected")
    expect(await dataSource.manager.findOneByOrFail(Subscription, { id: sub.id })).toMatchObject({ status: "rejected" })
    expect(await subscribe(f)).toMatchObject({ status: "active", version: 2 })
  })

  it("invalidates consent and old tasks when the actual template changes", async () => {
    const f = await fixture(), sub = await subscribe(f), task = await createTask(f, sub), send = sender()
    await request(app.getHttpServer()).put(`/staff/user-notifications/templates/${f.id}`).set(DEV_ADMIN_HEADERS)
      .send({ title: "新模板", category: "旅游产品上架通知", templateId: `new-${randomUUID()}`, type: "once", fields, enabled: true }).expect(200)
    await request(app.getHttpServer()).post(`/staff/user-notifications/tasks/${task.task.id}/send`).set(DEV_ADMIN_HEADERS).expect(201)
    expect(send).not.toHaveBeenCalled()
    expect(await dataSource.manager.findOneByOrFail(Subscription, { id: sub.id })).toMatchObject({ status: "withdrawn", version: 2 })
  })
})
