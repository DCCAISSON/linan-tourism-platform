import { createHash, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import type { INestApplication } from "@nestjs/common"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { PretripAttachmentEntity } from "../src/domain/entities/pretrip-attachment.entity.js"
import { MediaStorageService } from "../src/modules/media/media-storage.service.js"
import { closeCatalogTripDatabase, createCatalogTripApp, dataSource, databaseUrl, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"
import { createCatalog, familyHeader } from "./enrollment-consent-fixture.js"
import { createContinuationActor, continuationHeaders, CONTINUATION_ORIGIN } from "./business-continuation-fixture.js"
import { collectBinary, payEnrollment } from "./roster-export-fixture.js"

const scope = `attachments-${randomUUID().slice(0, 8)}`
const pdf = readFileSync(new URL("./fixtures/pretrip-attachments/synthetic-trip.pdf", import.meta.url))
const docx = readFileSync(new URL("./fixtures/pretrip-attachments/synthetic-trip.docx", import.meta.url))
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=", "base64")
const input = { gatheringAt: null, gatheringPlace: "合成学校南门", travelMode: "group", itineraryNote: "携带水杯", contactName: "合成联系人", contactPhone: "19900000000", serviceContact: "服务台", noticeVersionId: null }
const objects: string[] = []
const cosConfigured = ["TENCENT_CLOUD_REGION", "TENCENT_CLOUD_COS_BUCKET", "TENCENT_CLOUD_SECRET_ID", "TENCENT_CLOUD_SECRET_KEY"].every((name) => (process.env[name]?.trim().length ?? 0) > 0)
const previousEnvironment = { node: process.env["NODE_ENV"], origin: process.env["ADMIN_WEB_ORIGIN"], key: process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] }
let app: INestApplication
let storage: MediaStorageService
let sessionId = ""
let otherSessionId = ""
let orderId = ""
let otherOrderId = ""
let attachmentId = ""
let headers: Record<string, string> = {}
let staffId = ""
const family = familyHeader(scope, "a")

describe.skipIf(databaseUrl === undefined)(`pretrip attachment HTTP with ${cosConfigured ? "real COS" : "in-memory object storage"}`, () => {
  beforeAll(async () => {
    if (databaseUrl === undefined || new URL(databaseUrl).hostname !== "127.0.0.1") throw new Error("Attachment tests require a local isolated database")
    process.env["NODE_ENV"] = "development"
    process.env["ADMIN_WEB_ORIGIN"] = CONTINUATION_ORIGIN
    process.env["PERSON_DATA_ENCRYPTION_KEY_BASE64"] = Buffer.alloc(32, 18).toString("base64")
    await initializeCatalogTripDatabase()
    app = await createCatalogTripApp()
    storage = app.get(MediaStorageService)
    if (!cosConfigured) {
      const storedBytes = new Map<string, Buffer>()
      vi.spyOn(MediaStorageService.prototype, "putObject").mockImplementation(async ({ key, body }) => { storedBytes.set(key, Buffer.from(body)) })
      vi.spyOn(MediaStorageService.prototype, "getObject").mockImplementation(async (key) => {
        const body = storedBytes.get(key)
        if (body === undefined) throw new Error("Test storage object missing")
        return Buffer.from(body)
      })
      vi.spyOn(MediaStorageService.prototype, "deleteObject").mockImplementation(async (key) => { storedBytes.delete(key) })
    }
    const catalog = await createCatalog(app, scope)
    const other = await createCatalog(app, `${scope}-other`)
    sessionId = catalog.tourSessionId
    otherSessionId = other.tourSessionId
    const actor = await createContinuationActor(app, scope, "uploader", ["pretrip.read", "pretrip.write"], { kind: "tour_session", id: sessionId })
    staffId = actor.id
    headers = continuationHeaders(actor)
    orderId = await payEnrollment({ app, scope, catalog, family: "a", names: ["合成学生甲"], status: "succeeded" })
    otherOrderId = await payEnrollment({ app, scope: `${scope}-other`, catalog: other, family: "a", names: ["合成学生乙"], status: "succeeded" })
    await request(app.getHttpServer()).put(`/pretrip/staff/sessions/${sessionId}`).set(headers).send({ ...input, expectedVersion: 0, attachments: [] }).expect(200)
    attachmentId = randomUUID()
    const key = `pretrip/${sessionId}/${attachmentId}.pdf`
    objects.push(key)
    await storage.putObject({ key, body: pdf, contentType: "application/pdf" })
    await dataSource.manager.save(dataSource.manager.create(PretripAttachmentEntity, { id: attachmentId, tourSessionId: sessionId, objectKey: key, title: "合成行前须知.pdf", contentType: "application/pdf", byteSize: pdf.length, createdByStaffId: staffId }))
  }, 120000)

  afterAll(async () => {
    if (dataSource.isInitialized && sessionId !== "") {
      const attachments = await dataSource.manager.findBy(PretripAttachmentEntity, { tourSessionId: sessionId })
      for (const row of attachments) if (row.objectKey.startsWith(`pretrip/${sessionId}/`) && !objects.includes(row.objectKey)) objects.push(row.objectKey)
      for (const key of objects) await storage.deleteObject(key)
      await dataSource.manager.delete(PretripAttachmentEntity, { tourSessionId: sessionId })
    }
    if (app !== undefined) await app.close()
    vi.restoreAllMocks()
    await closeCatalogTripDatabase()
    restore("NODE_ENV", previousEnvironment.node)
    restore("ADMIN_WEB_ORIGIN", previousEnvironment.origin)
    restore("PERSON_DATA_ENCRYPTION_KEY_BASE64", previousEnvironment.key)
  }, 120000)

  it("returns stored PDF bytes rather than attachment metadata for the owning order", async () => {
    // Given
    const link = await request(app.getHttpServer()).post(`/orders/${orderId}/pretrip/attachments/${attachmentId}/url`).set(family).expect(201)
    // When
    const file = await request(app.getHttpServer()).get(String(link.body.url)).set(family).buffer(true).parse(collectBinary).expect(200)
    // Then
    expect(file.headers["content-type"]).toContain("application/pdf")
    expect(hash(file.body)).toBe(hash(pdf))
    process.stdout.write(`[attachments-byte-hash] ${scope} pdf ${hash(pdf)}\n`)
  })

  it("keeps existing attachments when staff saves unrelated configuration fields", async () => {
    // Given
    const current = await request(app.getHttpServer()).get(`/pretrip/staff/sessions/${sessionId}`).set(headers).expect(200)
    // When
    const saved = await request(app.getHttpServer()).put(`/pretrip/staff/sessions/${sessionId}`).set(headers).send({ ...input, gatheringPlace: "合成学校北门", expectedVersion: current.body.version }).expect(200)
    // Then
    expect(saved.body.attachments).toContainEqual(expect.objectContaining({ id: attachmentId }))
  })

  it.each([{ name: "须知.pdf", contentType: "application/pdf", body: pdf }, { name: "集合图.png", contentType: "image/png", body: png }, { name: "行程.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", body: docx }])("uploads and retrieves exact $contentType bytes", async ({ name, contentType, body }) => {
    // Given
    const current = await request(app.getHttpServer()).get(`/pretrip/staff/sessions/${sessionId}`).set(headers).expect(200)
    // When
    const uploaded = await request(app.getHttpServer()).post(`/pretrip/staff/sessions/${sessionId}/attachments`).set(headers).field("title", name).field("expectedVersion", String(current.body.version)).attach("file", body, { filename: name, contentType }).expect(201)
    const attachments: readonly { readonly id: string; readonly title: string }[] = uploaded.body.attachments
    const file = attachments.find((row) => row.title === name)
    if (file === undefined) throw new Error("Uploaded attachment missing")
    const link = await request(app.getHttpServer()).post(`/orders/${orderId}/pretrip/attachments/${file.id}/url`).set(family).expect(201)
    const downloaded = await request(app.getHttpServer()).get(String(link.body.url)).set(family).buffer(true).parse(collectBinary).expect(200)
    // Then
    expect(hash(downloaded.body)).toBe(hash(body))
    expect(downloaded.headers["content-type"]).toContain(contentType)
    expect(file).not.toHaveProperty("objectKey")
    process.stdout.write(`[attachments-byte-hash] ${scope} ${contentType} ${hash(body)}\n`)
  }, 30000)

  it("rejects another family using the owner's download link", async () => {
    // Given
    const link = await request(app.getHttpServer()).post(`/orders/${orderId}/pretrip/attachments/${attachmentId}/url`).set(family).expect(201)
    // When / Then
    await request(app.getHttpServer()).get(String(link.body.url)).set(familyHeader(scope, "outsider")).expect(404)
  })

  it("rejects an attachment from another session even for an owned order", async () => {
    // Given / When / Then
    await request(app.getHttpServer()).post(`/orders/${otherOrderId}/pretrip/attachments/${attachmentId}/url`).set(familyHeader(`${scope}-other`, "a")).expect(404)
  })

  it("rejects an expired link before retrieving stored bytes", async () => {
    // Given / When / Then
    await request(app.getHttpServer()).get(`/orders/${orderId}/pretrip/attachments/${attachmentId}/download?expiresAt=2000-01-01T00%3A00%3A00.000Z`).set(family).expect(410)
  })

  it("rejects upload outside the staff session scope", async () => {
    // Given / When / Then
    await request(app.getHttpServer()).post(`/pretrip/staff/sessions/${otherSessionId}/attachments`).set(headers).field("title", "越权.pdf").field("expectedVersion", "0").attach("file", pdf, { filename: "outside.pdf", contentType: "application/pdf" }).expect(403)
  })

  it("rejects an unowned attachment id without deleting the current selection", async () => {
    const current = await request(app.getHttpServer()).get(`/pretrip/staff/sessions/${sessionId}`).set(headers).expect(200)
    await request(app.getHttpServer()).put(`/pretrip/staff/sessions/${sessionId}`).set(headers).send({ ...input, expectedVersion: current.body.version, attachments: [{ id: "another-session-file", title: "非本团文件" }] }).expect(400)
    const after = await request(app.getHttpServer()).get(`/pretrip/staff/sessions/${sessionId}`).set(headers).expect(200)
    expect(after.body.attachments).toEqual(current.body.attachments)
    expect(after.body.version).toBe(current.body.version)
  })

  it("requires family authentication when the short link is reused", async () => {
    const link = await request(app.getHttpServer()).post(`/orders/${orderId}/pretrip/attachments/${attachmentId}/url`).set(family).expect(201)
    await request(app.getHttpServer()).get(String(link.body.url)).expect(401)
  })

  it("rejects stale upload versions without creating an attachment row", async () => {
    const before = await dataSource.manager.countBy(PretripAttachmentEntity, { tourSessionId: sessionId })
    await request(app.getHttpServer()).post(`/pretrip/staff/sessions/${sessionId}/attachments`).set(headers).field("title", "重复.pdf").field("expectedVersion", "0").attach("file", pdf, { filename: "stale.pdf", contentType: "application/pdf" }).expect(409)
    expect(await dataSource.manager.countBy(PretripAttachmentEntity, { tourSessionId: sessionId })).toBe(before)
  })
})

function hash(value: unknown): string {
  if (!Buffer.isBuffer(value)) throw new Error("Expected real binary file bytes")
  return createHash("sha256").update(value).digest("hex")
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
