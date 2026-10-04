import { randomUUID } from "node:crypto"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, DEV_ADMIN_HEADERS } from "./catalog-trip-fixture.js"
import { adultIdentityMemberBody, createCatalog, enrollmentBody, familyHeader, memberBody, restoreNodeEnv, virtualResidentId } from "./enrollment-consent-fixture.js"
import { TourSessionEntity } from "../src/domain/entities/index.js"
import type { EntitySubscriberInterface } from "typeorm"
import { ConfigurationDatabaseService } from "../src/modules/configuration/configuration-database.service.js"
import { OrderModule } from "../src/modules/order/order.module.js"

describe.skipIf(databaseUrl === undefined)("session enrollment scope", () => {
  let app: INestApplication
  const previousNodeEnv = process.env["NODE_ENV"]
  const previousKey = process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]

  beforeAll(async () => {
    process.env["NODE_ENV"] = "development"
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 19).toString("base64")
    await dataSource.initialize()
    app = await createCatalogTripApp()
  })
  afterAll(async () => {
    await app.close()
    await closeCatalogTripDatabase()
    restoreNodeEnv(previousNodeEnv)
    if (previousKey === undefined) delete process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"]
    else process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = previousKey
  })

  async function fixture() {
    const scope = `scope-${randomUUID()}`
    const catalog = await createCatalog(app, scope)
    const headers = familyHeader(scope, "scope")
    const secondClass = await request(app.getHttpServer()).post(`/grades/${catalog.gradeId}/classes`).set(DEV_ADMIN_HEADERS)
      .send({ code: `class-two-${scope}`, name: "Second Class" }).expect(201)
    const member = await request(app.getHttpServer()).post("/enrollment/members").set(headers)
      .send(memberBody(catalog, "Scope Student", `member-${scope}`)).expect(201)
    const body = enrollmentBody({ catalog, memberIds: [String(member.body.id)], contactName: "Parent", emergencyContactName: "Parent", emergencyContactPhone: "19900001111" })
    return { catalog, headers, body, secondClassId: String(secondClass.body.id) }
  }

  it("keeps old-client full-school behavior and preserves scope during ordinary edits", async () => {
    const f = await fixture()
    const path = `/configuration/tour-sessions/${f.catalog.tourSessionId}/enrollment-scope`
    const enrollmentScope = [{ gradeId: f.catalog.gradeId, classIds: [f.catalog.classId] }]
    const initial = await request(app.getHttpServer()).get("/tour-sessions").expect(200)
    expect(initial.body).toContainEqual(expect.objectContaining({ id: f.catalog.tourSessionId, enrollmentScope: null }))
    await request(app.getHttpServer()).put(path).set(DEV_ADMIN_HEADERS).send({ enrollmentScope }).expect(200)
    const edited = await request(app.getHttpServer()).patch(`/tour-sessions/${f.catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS).send({ capacity: 35 }).expect(200)
    expect(edited.body.enrollmentScope).toEqual(enrollmentScope)
    await request(app.getHttpServer()).post("/enrollments").set(f.headers).send(f.body).expect(201)
    const cleared = await request(app.getHttpServer()).put(path).set(DEV_ADMIN_HEADERS).send({ enrollmentScope: null }).expect(200)
    expect(cleared.body.enrollmentScope).toBeNull()
  })

  it("rejects other-school grades and wrong-grade classes and unauthorized writes", async () => {
    const f = await fixture()
    const other = await createCatalog(app, `other-${randomUUID()}`)
    const path = `/configuration/tour-sessions/${f.catalog.tourSessionId}/enrollment-scope`
    for (const enrollmentScope of [[{ gradeId: other.gradeId, classIds: null }], [{ gradeId: f.catalog.gradeId, classIds: [other.classId] }]]) {
      const response = await request(app.getHttpServer()).put(path).set(DEV_ADMIN_HEADERS).send({ enrollmentScope }).expect(400)
      expect(response.body.code).toBe("organization_mismatch")
    }
    const response = await request(app.getHttpServer()).put(path).send({ enrollmentScope: null })
    expect([401, 403]).toContain(response.status)
  })

  it("rejects an excluded student even when the same enrollment includes an adult", async () => {
    const f = await fixture()
    const adult = await request(app.getHttpServer()).post("/enrollment/members").set(f.headers).send(adultIdentityMemberBody(f.catalog, "Adult", `adult-${randomUUID()}`, {
      participantKind: "adult", identityNumber: virtualResidentId("19800101", "003"), phone: "19900001111",
    })).expect(201)
    await request(app.getHttpServer()).patch(`/tour-sessions/${f.catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS)
      .send({ enrollmentScope: [{ gradeId: f.catalog.gradeId, classIds: [f.secondClassId] }] }).expect(200)
    const response = await request(app.getHttpServer()).post("/enrollments").set(f.headers)
      .send({ ...f.body, memberIds: [...f.body.memberIds, adult.body.id] }).expect(400)
    expect(response.body.code).toBe("enrollment_scope_mismatch")
  })

  it("rechecks a draft when creating its first order but keeps existing orders idempotent", async () => {
    const f = await fixture()
    const first = await request(app.getHttpServer()).post("/enrollments").set(f.headers).send(f.body).expect(201)
    const draft = await request(app.getHttpServer()).post("/enrollments").set(f.headers).send(f.body).expect(201)
    const orderBody = { enrollmentId: first.body.id, payerName: "Parent", requestIdempotencyKey: `order-${randomUUID()}` }
    const original = await request(app.getHttpServer()).post("/orders").set(f.headers).send(orderBody).expect(201)
    await request(app.getHttpServer()).patch(`/tour-sessions/${f.catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS)
      .send({ enrollmentScope: [{ gradeId: f.catalog.gradeId, classIds: [f.secondClassId] }] }).expect(200)
    const retried = await request(app.getHttpServer()).post("/orders").set(f.headers).send(orderBody).expect(201)
    expect(retried.body).toEqual(original.body)
    const blocked = await request(app.getHttpServer()).post("/orders").set(f.headers)
      .send({ ...orderBody, enrollmentId: draft.body.id, requestIdempotencyKey: `draft-${randomUUID()}` }).expect(400)
    expect(blocked.body.code).toBe("enrollment_scope_mismatch")
    await request(app.getHttpServer()).get(`/orders/${original.body.id}`).set(f.headers).expect(200)
  })

  it("observes a committed range change when new order creation waits on the session lock", async () => {
    const f = await fixture()
    const draft = await request(app.getHttpServer()).post("/enrollments").set(f.headers).send(f.body).expect(201)
    const runner = dataSource.createQueryRunner()
    const appDatabase = await app.select(OrderModule).get(ConfigurationDatabaseService, { strict: true }).getDataSource()
    const observer: EntitySubscriberInterface = {}
    const lockAttempted = new Promise<void>((resolve) => {
      observer.beforeQuery = (event) => {
        if (event.query.includes("tour_sessions") && event.query.includes("FOR UPDATE")) resolve()
      }
    })
    appDatabase.subscribers.push(observer)
    let barrierTimer: ReturnType<typeof setTimeout> | undefined
    let pending: Promise<request.Response> | undefined
    await runner.connect()
    await runner.startTransaction()
    try {
      await runner.manager.findOne(TourSessionEntity, { where: { id: f.catalog.tourSessionId }, lock: { mode: "pessimistic_write" } })
      await runner.manager.update(TourSessionEntity, f.catalog.tourSessionId, { enrollmentScopeJson: [{ gradeId: f.catalog.gradeId, classIds: [f.secondClassId] }] })
      pending = request(app.getHttpServer()).post("/orders").set(f.headers)
        .send({ enrollmentId: draft.body.id, payerName: "Parent", requestIdempotencyKey: `concurrent-${randomUUID()}` }).then((response) => response)
      await Promise.race([
        lockAttempted,
        new Promise<never>((_resolve, reject) => {
          barrierTimer = setTimeout(() => reject(new Error("OrderModule did not attempt the session write lock")), 2000)
        }),
      ])
      await runner.commitTransaction()
      const response = await pending
      expect(response.status).toBe(400)
      expect(response.body.code).toBe("enrollment_scope_mismatch")
    } finally {
      if (barrierTimer !== undefined) clearTimeout(barrierTimer)
      appDatabase.subscribers.splice(appDatabase.subscribers.indexOf(observer), 1)
      if (runner.isTransactionActive) await runner.rollbackTransaction()
      await runner.release()
      await Promise.allSettled(pending === undefined ? [] : [pending])
    }
  })

  it("retains the latest range when notice activation and regular edits run concurrently", async () => {
    const f = await fixture()
    const enrollmentScope = [{ gradeId: f.catalog.gradeId, classIds: [f.secondClassId] }]
    await Promise.all([
      request(app.getHttpServer()).patch(`/tour-sessions/${f.catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS).send({ enrollmentScope }).expect(200),
      request(app.getHttpServer()).patch(`/tour-sessions/${f.catalog.tourSessionId}`).set(DEV_ADMIN_HEADERS).send({ capacity: 40 }).expect(200),
      request(app.getHttpServer()).post(`/tour-sessions/${f.catalog.tourSessionId}/notices/${f.catalog.noticeVersionId}/activate`).set(DEV_ADMIN_HEADERS).expect(201),
    ])
    const saved = await dataSource.getRepository(TourSessionEntity).findOneByOrFail({ id: f.catalog.tourSessionId })
    expect(saved.enrollmentScopeJson).toEqual(enrollmentScope)
    expect(saved.capacity).toBe(40)
    expect(saved.activeNoticeId).toBe(f.catalog.noticeVersionId)
  })
})
