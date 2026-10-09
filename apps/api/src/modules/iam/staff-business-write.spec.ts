import { ForbiddenException, type INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDomainDataSource } from "../../domain/data-source.js"
import { StaffAccountEntity, StaffAccountPermissionEntity, StaffAccountScopeEntity, StaffSessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { EvaluationsController } from "../evaluations/evaluations.controller.js"
import { EvaluationsService } from "../evaluations/evaluations.service.js"
import { StaffMediaController } from "../media/media.controller.js"
import { MediaService } from "../media/media.service.js"
import { DevStaffAccessService } from "./dev-staff-access.service.js"

const token = "a".repeat(43)
const origin = "https://admin.test"
const native = { Authorization: `Staff ${token}` } as const
const browser = { Cookie: `linan_staff_session=${token}`, Origin: origin } as const
const mediaPath = "/staff/media/sessions/session-a"
const observation = { internalComment: "愿意帮助同学", excellent: true, attention: false, gradeCode: null } as const
const standard = {
  id: "standard-a", tourSessionId: "session-a", title: "研学评价", confirmedAt: null, version: 1, dimensions: [],
  items: [{ code: "A", label: "优秀", description: "表现良好" }, { code: "B", label: "合格", description: "继续努力" }],
} as const
const asset = {
  id: "asset-a", tourSessionId: "session-a", title: "研学照片", kind: "image", contentType: "image/png", byteSize: 8,
  status: "draft", version: 1, authorStaffId: "staff-guide", createdAt: "2026-10-09T00:00:00.000Z", cleanupPending: false,
} as const

function writeFixture() {
  const source = createDomainDataSource("mysql://test:test@localhost/test")
  const database = new ConfigurationDatabaseService()
  vi.spyOn(database, "getDataSource").mockResolvedValue(source)
  const account = Object.assign(new StaffAccountEntity(), { id: "staff-guide", forcePasswordChange: false })
  const session = Object.assign(new StaffSessionEntity(), { staffAccountId: account.id, expiresAt: new Date("2100-01-01") })
  const findSession = vi.spyOn(source.getRepository(StaffSessionEntity), "findOneBy").mockResolvedValue(session)
  vi.spyOn(source.getRepository(StaffAccountEntity), "findOneBy").mockResolvedValue(account)
  vi.spyOn(source.getRepository(StaffAccountPermissionEntity), "findBy").mockResolvedValue([
    Object.assign(new StaffAccountPermissionEntity(), { permissionKey: "execution.read" }),
  ])
  vi.spyOn(source.getRepository(StaffAccountScopeEntity), "findBy").mockResolvedValue([
    Object.assign(new StaffAccountScopeEntity(), { scopeKind: "tour_session", scopeId: "session-a" }),
  ])
  const media = {
    upload: vi.fn<MediaService["upload"]>().mockResolvedValue(asset),
    changeStatus: vi.fn<MediaService["changeStatus"]>().mockResolvedValue(asset),
    remove: vi.fn<MediaService["remove"]>().mockResolvedValue({ deleted: true }),
    saveProvider: vi.fn<MediaService["saveProvider"]>().mockResolvedValue({ kind: "album", label: "", url: "", enabled: false, version: 1 }),
  }
  const evaluations = {
    createStandard: vi.fn<EvaluationsService["createStandard"]>().mockResolvedValue(standard),
    confirmStandard: vi.fn<EvaluationsService["confirmStandard"]>().mockResolvedValue(standard),
    batchEvaluate: vi.fn<EvaluationsService["batchEvaluate"]>().mockResolvedValue([]),
    revise: vi.fn<EvaluationsService["revise"]>().mockResolvedValue({
      ...observation, id: "evaluation-a", version: 1, standardId: null, personRef: "paid:student-a", displayName: "学生甲",
      organizationId: "school-a", gradeName: null, className: null, gradeLabel: null, confirmedAt: null, dimensionObservations: [],
    }),
    confirmSession: vi.fn<EvaluationsService["confirmSession"]>().mockResolvedValue([]),
  }
  return { access: new DevStaffAccessService(database), account, findSession, media, evaluations }
}

const routes = [
  { name: "media upload", status: 201, send: (app: INestApplication) => request(app.getHttpServer()).post(`${mediaPath}/assets`)
    .field("title", "研学照片").field("requestId", "00000000-0000-4000-8000-000000000001")
    .attach("file", Buffer.from("89504e470d0a1a0a", "hex"), { filename: "photo.png", contentType: "image/png" }) },
  { name: "media publish", status: 200, send: (app: INestApplication) => request(app.getHttpServer()).patch(`${mediaPath}/assets/asset-a/status`).send({ status: "published", expectedVersion: 1 }) },
  { name: "media native publish", status: 201, send: (app: INestApplication) => request(app.getHttpServer()).post(`${mediaPath}/assets/asset-a/status`).send({ status: "published", expectedVersion: 1 }) },
  { name: "media delete", status: 200, send: (app: INestApplication) => request(app.getHttpServer()).delete(`${mediaPath}/assets/asset-a?expectedVersion=1`) },
  { name: "evaluation batch", status: 201, send: (app: INestApplication) => request(app.getHttpServer()).post("/evaluations/staff/batch").send({ tourSessionId: "session-a", standardId: null, idempotencyKey: "request-a", observations: [{ ...observation, personRef: "paid:student-a" }] }) },
  { name: "evaluation revise", status: 201, send: (app: INestApplication) => request(app.getHttpServer()).post("/evaluations/staff/evaluation-a").send({ ...observation, expectedVersion: 1 }) },
  { name: "evaluation session confirm", status: 201, send: (app: INestApplication) => request(app.getHttpServer()).post("/evaluations/staff/sessions/session-a/confirm").send({}) },
] as const

const browserRoutes = [
  { name: "media provider", status: 200, send: (app: INestApplication) => request(app.getHttpServer()).patch(`${mediaPath}/providers`).send({ kind: "album", label: "", url: "", enabled: false, expectedVersion: 0 }) },
  { name: "evaluation standard create", status: 201, send: (app: INestApplication) => request(app.getHttpServer()).post("/evaluations/staff/standards").send({ tourSessionId: standard.tourSessionId, title: standard.title, items: standard.items, publicFormatNote: "等级评价" }) },
  { name: "evaluation standard confirm", status: 201, send: (app: INestApplication) => request(app.getHttpServer()).post("/evaluations/staff/standards/standard-a/confirm").send({ expectedVersion: 1, confirmed: true }) },
] as const

describe("staff media and evaluation write transport", () => {
  let app: INestApplication
  let fixture: ReturnType<typeof writeFixture>

  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ADMIN_WEB_ORIGIN", origin)
    fixture = writeFixture()
    const module = await Test.createTestingModule({
      controllers: [StaffMediaController, EvaluationsController],
      providers: [
        { provide: DevStaffAccessService, useValue: fixture.access },
        { provide: MediaService, useValue: fixture.media },
        { provide: EvaluationsService, useValue: fixture.evaluations },
      ],
    }).compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    await app.close()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe.each(routes)("$name", route => {
    it("reaches the service when a production native session is supplied without Origin", async () => {
      const response = await route.send(app).set(native)
      expect(response.status).toBe(route.status)
      const invoked = Object.values({ ...fixture.media, ...fixture.evaluations }).filter(method => method.mock.calls.length > 0)
      expect(invoked).toHaveLength(1)
      expect(invoked[0]?.mock.calls[0]?.[0]).toMatchObject({ actorId: "staff-guide", scopes: [{ kind: "tour_session", id: "session-a" }] })
    })

    it("retains browser writes when the session cookie and allowed Origin are supplied", async () => {
      const response = await route.send(app).set(browser)
      expect(response.status).toBe(route.status)
    })

    it.each([
      { Cookie: browser.Cookie },
      { Cookie: browser.Cookie, Origin: "https://other.test" },
    ])("rejects browser writes when the allowed Origin is absent: %j", async headers => {
      const response = await route.send(app).set(headers)
      expect(response.status).toBe(403)
      for (const method of Object.values({ ...fixture.media, ...fixture.evaluations })) expect(method).not.toHaveBeenCalled()
    })

    it.each([
      { ...native, Cookie: browser.Cookie },
      { ...native, Origin: origin },
      { ...native, "x-linan-dev-staff-role": "administrator" },
      { Authorization: "Bearer family-token" },
      { Authorization: "Staff invalid" },
    ])("rejects mixed or invalid native credentials: %j", async headers => {
      const response = await route.send(app).set(headers)
      expect(response.status).toBe(401)
      for (const method of Object.values({ ...fixture.media, ...fixture.evaluations })) expect(method).not.toHaveBeenCalled()
    })

    it("rejects a native credential when its session no longer exists", async () => {
      fixture.findSession.mockResolvedValue(null)
      const response = await route.send(app).set(native)
      expect(response.status).toBe(401)
    })

    it("preserves a business permission denial after native authentication", async () => {
      for (const method of Object.values({ ...fixture.media, ...fixture.evaluations })) method.mockRejectedValue(new ForbiddenException("无权操作"))
      const response = await route.send(app).set(native)
      expect(response.status).toBe(403)
      expect(response.body).toMatchObject({ message: "无权操作" })
    })
  })

  describe.each(browserRoutes)("$name remains a browser operation", route => {
    it("requires browser Origin when only a native credential is supplied", async () => {
      const response = await route.send(app).set(native)
      expect(response.status).toBe(403)
    })

    it("allows the existing browser session and Origin", async () => {
      const response = await route.send(app).set(browser)
      expect(response.status).toBe(route.status)
    })
  })
})
