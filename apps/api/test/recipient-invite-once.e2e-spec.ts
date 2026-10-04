import { randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { AppModule } from "../src/app.module.js"
import { NotificationRecipientAuthorizationEntity as Authorization } from "../src/domain/entities/notification-recipient-authorization.entity.js"
import { RecipientTemplateConsentEntity as Consent } from "../src/domain/entities/notification-recipient-invite.entity.js"
import { NotificationBusinessSourceEntity as Source } from "../src/domain/entities/notification-business-source.entity.js"
import { NotificationDeliveryTargetEntity as Target } from "../src/domain/entities/notification-delivery.entity.js"
import { PretripConfigEntity } from "../src/domain/entities/pretrip-config.entity.js"
import { UserNotificationTemplateEntity as Template } from "../src/domain/entities/user-notification.entity.js"
import { ConfigurationDatabaseService } from "../src/modules/configuration/configuration-database.service.js"
import { EnrollmentAutoNotificationService } from "../src/modules/notifications/enrollment-auto-notification.service.js"
import { WechatSubscribeAdapter, type WechatSubscribeOutcome, type WechatSubscribeRequest } from "../src/modules/notifications/wechat-subscribe.adapter.js"
import { createContinuationFixture, continuationHeaders } from "./business-continuation-fixture.js"
import { closeCatalogTripDatabase, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"

describe.skipIf(databaseUrl === undefined)("recipient once consent commit boundary", () => {
  let app: INestApplication
  const send = vi.fn(async (_input: WechatSubscribeRequest): Promise<WechatSubscribeOutcome> => ({ status: "api_accepted", errorCode: null, providerMessage: "isolated accepted", retryable: false }))

  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.spyOn(EnrollmentAutoNotificationService.prototype, "onApplicationBootstrap").mockImplementation(() => {})
    await initializeCatalogTripDatabase()
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigurationDatabaseService).useValue({ getDataSource: async () => dataSource })
      .overrideProvider(WechatSubscribeAdapter).useValue({ send }).compile()
    app = module.createNestApplication()
    await app.init()
  })
  afterAll(async () => { await app?.close(); await closeCatalogTripDatabase(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it("does not consume invalid templates and persists consumption before unknown or interrupted sends", async () => {
    const f = await createContinuationFixture(app)
    const headers = continuationHeaders(f.admin)
    const api = request(app.getHttpServer())
    const sessionId = f.catalog.tourSessionId
    const templateId = `once-${randomUUID()}`
    const template = await dataSource.manager.save(Template, { id: randomUUID(), templateId, title: "行前提醒", category: "activity", type: "once", fields: [{ key: "thing1", label: "活动名称", rule: "thing" }], enabled: true, updatedBy: f.admin.id })
    await dataSource.manager.save(dataSource.manager.create(PretripConfigEntity, { tourSessionId: sessionId, gatheringPlace: "集合点", itineraryNote: "行前安排", updatedByStaffId: f.admin.id, version: 1 }))
    const authorization = await dataSource.manager.save(Authorization, { id: randomUUID(), organizationId: f.catalog.schoolId, orderId: f.familyA.orderId, familyActorId: `recipient-${f.scope}`, receiverName: "独立出行人", relation: "traveler", channel: "wechat_subscribe", subscriberOpenid: `synthetic-${f.scope}`, active: true, scope: "pretrip_only", expiresAt: new Date(Date.now() + 60_000), idempotencyKey: randomUUID() })
    const consent = await dataSource.manager.save(Consent, { id: randomUUID(), authorizationId: authorization.id, templateId, status: "active", version: 1 })
    const content = await api.post(`/staff/notifications/sessions/${sessionId}/content-versions`).set(headers).send({ title: "行前提醒", bodyText: "不得透传的正文", templateId, miniappPage: "pages/orders/detail", templateData: { thing1: { value: "不得透传的付款信息" } } }).expect(201)
    async function task(): Promise<string> {
      const source = await dataSource.manager.save(Source, { id: randomUUID(), kind: "pretrip_updated", sessionId, sourceVersion: 1, sourceKey: randomUUID(), title: "行前更新", bodyText: "行前更新" })
      const result = await api.post(`/staff/notifications/sessions/${sessionId}/tasks`).set(headers).send({ sourceId: source.id, contentVersionId: content.body.id, authorizationIds: [authorization.id], idempotencyKey: randomUUID() }).expect(201)
      return String(result.body.id)
    }

    const unsafeTask = await task()
    await dataSource.manager.update(Template, { id: template.id }, { fields: [{ key: "thing1", label: "付款信息", rule: "thing" }] })
    await api.post(`/staff/notifications/tasks/${unsafeTask}/send`).set(headers).send({}).expect(201)
    expect(send).not.toHaveBeenCalled()
    expect((await dataSource.manager.findOneByOrFail(Consent, { id: consent.id })).status).toBe("active")
    await dataSource.manager.update(Template, { id: template.id }, { fields: [{ key: "thing1", label: "活动名称", rule: "thing" }] })

    const interruptedTask = await task()
    const transaction = vi.spyOn(dataSource.manager, "transaction")
    send.mockImplementationOnce(async () => {
      expect((await dataSource.manager.findOneByOrFail(Consent, { id: consent.id })).status).toBe("consumed")
      expect((await dataSource.manager.findOneByOrFail(Target, { taskId: interruptedTask })).status).toBe("manual_required")
      transaction.mockRejectedValueOnce(new Error("isolated interruption after provider accepted"))
      return { status: "api_accepted", errorCode: null, providerMessage: "isolated accepted", retryable: false }
    })
    await api.post(`/staff/notifications/tasks/${interruptedTask}/send`).set(headers).send({}).expect(500)
    transaction.mockRestore()
    expect((await dataSource.manager.findOneByOrFail(Consent, { id: consent.id })).status).toBe("consumed")
    await api.post(`/staff/notifications/tasks/${interruptedTask}/retry`).set(headers).send({}).expect(201)
    await api.post(`/staff/notifications/tasks/${interruptedTask}/send`).set(headers).send({}).expect(201)
    expect(send).toHaveBeenCalledTimes(1)

    await dataSource.manager.update(Consent, { id: consent.id }, { status: "active", version: 3 })
    const unknownTask = await task()
    send.mockImplementationOnce(async () => {
      expect((await dataSource.manager.findOneByOrFail(Consent, { id: consent.id })).status).toBe("consumed")
      throw new Error("isolated unknown transport result")
    })
    const result = await api.post(`/staff/notifications/tasks/${unknownTask}/send`).set(headers).send({}).expect(201)
    expect(result.body.attempts[0]).toMatchObject({ status: "manual_required", errorCode: "wechat_transport_unknown" })
    expect((await dataSource.manager.findOneByOrFail(Consent, { id: consent.id })).status).toBe("consumed")
    await api.post(`/staff/notifications/tasks/${unknownTask}/retry`).set(headers).send({}).expect(201)
    expect(send).toHaveBeenCalledTimes(2)
  })
})
