import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { createServer, type Server } from "node:http"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { In } from "typeorm"
import {
  EnrollmentEntity, FamilyEntity, OrderEntity, UserNotificationAttemptEntity as Attempt,
  UserNotificationSubscriptionEntity as Subscription, UserNotificationTargetEntity as Target,
  UserNotificationTaskEntity as Task, UserNotificationTemplateEntity as Template, WechatIdentityEntity,
} from "../src/domain/entities/index.js"
import type { UserTemplateField } from "../src/domain/entities/user-notification.entity.js"
import { EnrollmentAutoNotificationService } from "../src/modules/notifications/enrollment-auto-notification.service.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createOrder, createPaidEnrollmentFixture, mockEventBody, resetMockPaymentData, startMockPayment, type PaidEnrollmentFixture } from "./mock-payment-fixture.js"

const fields = [
  { key: "thing5", label: "线路名", rule: "thing" },
  { key: "number4", label: "人数", rule: "number" },
  { key: "time1", label: "预约时间", rule: "time" },
] as const

const formalEnrollmentTemplateId = "g4vOTMwPwXZCV636hzQjSsv7SplCumn4LjGADFzB4Fs"

type StubReply = { readonly kind: "accepted" | "rejected" | "unknown" }

describe.skipIf(databaseUrl === undefined)("QA: enrollment automatic notification over the real local HTTP wire", () => {
  let app: INestApplication
  let server: Server
  let origin = ""
  let reply: StubReply = { kind: "accepted" }
  const scopes: string[] = []
  const templateIds: string[] = []
  const identityHashes: string[] = []
  const received: string[] = []
  const waiters = new Map<number, (body: string) => void>()

  beforeAll(async () => {
    server = createServer((incoming, response) => {
      const chunks: Buffer[] = []
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk))
      incoming.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8")
        const index = received.push(body) - 1
        waiters.get(index)?.(body)
        if (reply.kind === "unknown") {
          incoming.socket.destroy()
          return
        }
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify(reply.kind === "accepted" ? { errcode: 0, errmsg: "ok" } : { errcode: 43101, errmsg: "refused" }))
      })
    })
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    const address = server.address()
    if (address === null || typeof address === "string") throw new TypeError("local WeChat stub did not expose a TCP port")
    origin = `http://127.0.0.1:${address.port}`
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
  }, 60_000)

  afterEach(async () => {
    await clearFixtures()
    vi.unstubAllEnvs()
    reply = { kind: "accepted" }
    waiters.clear()
  })

  afterAll(async () => {
    await app.close()
    await closeCatalogTripDatabase()
    await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  })

  async function clearFixtures(): Promise<void> {
    const tasks = templateIds.length === 0 ? [] : await dataSource.manager.findBy(Task, { templateId: In(templateIds) })
    if (tasks.length > 0) {
      await dataSource.manager.delete(Attempt, { taskId: In(tasks.map(task => task.id)) })
      await dataSource.manager.delete(Target, { taskId: In(tasks.map(task => task.id)) })
      await dataSource.manager.delete(Task, { id: In(tasks.map(task => task.id)) })
    }
    if (templateIds.length > 0) {
      await dataSource.manager.delete(Subscription, { templateId: In(templateIds) })
      await dataSource.manager.delete(Template, { id: In(templateIds) })
    }
    if (identityHashes.length > 0) await dataSource.manager.delete(WechatIdentityEntity, { openidHash: In(identityHashes) })
    for (const scope of scopes) await resetMockPaymentData(scope)
    templateIds.splice(0)
    identityHashes.splice(0)
    scopes.splice(0)
  }

  function enableLocalWechat(): void {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "true")
    vi.stubEnv("WECHAT_SUBSCRIBE_ACCESS_TOKEN", "qa-local-token")
    vi.stubEnv("WECHAT_SUBSCRIBE_API_ORIGIN", origin)
  }

  async function fixture(): Promise<{ readonly fixture: PaidEnrollmentFixture; readonly scope: string; readonly template: Template }> {
    const scope = `qa-enrollment-auto-${randomUUID()}`
    scopes.push(scope)
    const paidFixture = await createPaidEnrollmentFixture({ app, scope, family: "subscriber", participantCount: 2 })
    const enrollment = await dataSource.manager.findOneByOrFail(EnrollmentEntity, { id: paidFixture.enrollmentId })
    if (enrollment.familyId === null) throw new TypeError("fixture enrollment lacks a family")
    const family = await dataSource.manager.findOneByOrFail(FamilyEntity, { id: enrollment.familyId })
    const template = await dataSource.manager.save(Template, {
      id: randomUUID(), title: "预约成功通知", category: "enrollment", templateId: formalEnrollmentTemplateId,
      type: "once", fields: [...fields] satisfies readonly UserTemplateField[], enabled: true, updatedBy: "qa",
    })
    const openidHash = randomUUID().replaceAll("-", "").padEnd(64, "0")
    templateIds.push(template.id)
    identityHashes.push(openidHash)
    await dataSource.manager.save(WechatIdentityEntity, { openidHash, familyCode: family.code })
    await dataSource.manager.save(Subscription, {
      id: randomUUID(), actorId: openidHash, templateId: template.id, openid: `qa-openid-${randomUUID()}`, status: "active", version: 1,
    })
    return { fixture: paidFixture, scope, template }
  }

  async function confirm(paidFixture: PaidEnrollmentFixture, scope: string): Promise<{ readonly orderId: string; readonly event: ReturnType<typeof mockEventBody> }> {
    const order = await createOrder(app, paidFixture, `qa-order-${scope}`)
    const payment = await startMockPayment(app, paidFixture, order.id)
    const event = mockEventBody({ eventId: `qa-event-${scope}`, orderId: order.id, transactionId: `qa-transaction-${scope}`, amountFen: payment.amountFen, status: "succeeded" })
    await request(app.getHttpServer()).post("/payments/mock/events").set(paidFixture.headers).send(event).expect(201)
    return { orderId: order.id, event }
  }

  function requestAt(index: number): Promise<string> {
    const existing = received[index]
    if (existing !== undefined) return Promise.resolve(existing)
    return new Promise(resolve => waiters.set(index, resolve))
  }

  it("does not create or send while payment is pending", async () => {
    enableLocalWechat()
    const start = received.length
    const { fixture: paidFixture, scope, template } = await fixture()
    await createOrder(app, paidFixture, `qa-pending-${scope}`)
    expect(await dataSource.manager.countBy(Task, { templateId: template.id })).toBe(0)
    expect(received).toHaveLength(start)
  })

  it("creates and sends once after confirmation, and does not resend a replayed payment event", async () => {
    enableLocalWechat()
    const start = received.length
    const { fixture: paidFixture, scope, template } = await fixture()
    const { orderId, event } = await confirm(paidFixture, scope)
    const wire = JSON.parse(await requestAt(start)) as { readonly touser: string; readonly template_id: string; readonly data: Record<string, { readonly value: string }> }
    expect(wire.template_id).toBe(formalEnrollmentTemplateId)
    expect(Object.keys(wire.data).sort()).toEqual(["number4", "thing5", "time1"])
    expect(wire.data).toMatchObject({ thing5: { value: expect.any(String) }, number4: { value: "2" }, time1: { value: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/) } })
    await vi.waitFor(async () => expect(await dataSource.manager.findOneByOrFail(Target, { taskId: (await dataSource.manager.findOneByOrFail(Task, { idempotencyKey: `enrollment-confirmed:${orderId}` })).id })).toMatchObject({ status: "api_accepted" }))
    await request(app.getHttpServer()).post("/payments/mock/events").set(paidFixture.headers).send(event).expect(201)
    expect(await dataSource.manager.countBy(Task, { templateId: template.id })).toBe(1)
    expect(received).toHaveLength(start + 1)
  })

  it("does not create or send for a rejected subscription", async () => {
    enableLocalWechat()
    const start = received.length
    const { fixture: paidFixture, scope, template } = await fixture()
    await dataSource.manager.update(Subscription, { templateId: template.id }, { status: "rejected" })
    await confirm(paidFixture, scope)
    expect(await dataSource.manager.countBy(Task, { templateId: template.id })).toBe(0)
    expect(received).toHaveLength(start)
  })

  it("records an unknown wire result once and does not retry it", async () => {
    enableLocalWechat()
    reply = { kind: "unknown" }
    const start = received.length
    const { fixture: paidFixture, scope } = await fixture()
    const { orderId } = await confirm(paidFixture, scope)
    await requestAt(start)
    const service = app.get(EnrollmentAutoNotificationService)
    await vi.waitFor(async () => expect(await dataSource.manager.findOneByOrFail(Target, { taskId: (await dataSource.manager.findOneByOrFail(Task, { idempotencyKey: `enrollment-confirmed:${orderId}` })).id })).toMatchObject({ status: "unknown" }))
    await service.dispatchPending()
    expect(received).toHaveLength(start + 1)
  })

  it("dispatches a pending confirmed task after an application restart without rolling back enrollment on a provider rejection", async () => {
    vi.stubEnv("WECHAT_SUBSCRIBE_ENABLED", "false")
    const start = received.length
    const { fixture: paidFixture, scope } = await fixture()
    const { orderId } = await confirm(paidFixture, scope)
    expect(await dataSource.manager.findOneByOrFail(Target, { taskId: (await dataSource.manager.findOneByOrFail(Task, { idempotencyKey: `enrollment-confirmed:${orderId}` })).id })).toMatchObject({ status: "pending" })
    await app.close()
    enableLocalWechat()
    reply = { kind: "rejected" }
    app = await createCatalogTripApp()
    await requestAt(start)
    expect(await dataSource.manager.findOneByOrFail(OrderEntity, { id: orderId })).toMatchObject({ status: "paid" })
    expect(await dataSource.manager.findOneByOrFail(EnrollmentEntity, { id: paidFixture.enrollmentId })).toMatchObject({ status: "confirmed" })
    await vi.waitFor(async () => expect(await dataSource.manager.findOneByOrFail(Target, { taskId: (await dataSource.manager.findOneByOrFail(Task, { idempotencyKey: `enrollment-confirmed:${orderId}` })).id })).toMatchObject({ status: "rejected" }))
  }, 70_000)

})
