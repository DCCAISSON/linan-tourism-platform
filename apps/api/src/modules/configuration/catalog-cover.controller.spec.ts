import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
import { IamModule } from "../iam/iam.module.js"
import { TencentCosObjectStorage, type PutCosObject } from "../storage/tencent-cos-object-storage.js"
import { ConfigurationModule } from "./configuration.module.js"

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64")
const adminHeaders = { "x-linan-dev-staff-role": "administrator", "x-linan-dev-staff-id": "cover-editor", Origin: "https://admin.example.org" }
const filename = "7ee99445-8c06-41f5-92f3-0c5e6c49b999.png"
const route = "/configuration/catalog-covers"

describe("catalog cover HTTP upload and public reading", () => {
  let app: INestApplication
  const objects = new Map<string, PutCosObject>()

  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("ADMIN_WEB_ORIGIN", adminHeaders.Origin)
    vi.stubEnv("TENCENT_CLOUD_COS_BUCKET", "cover-test-1250000000")
    vi.stubEnv("TENCENT_CLOUD_REGION", "ap-shanghai")
    vi.stubEnv("TENCENT_CLOUD_SECRET_ID", "synthetic-id")
    vi.stubEnv("TENCENT_CLOUD_SECRET_KEY", "synthetic-key")
    objects.clear()
    vi.spyOn(TencentCosObjectStorage.prototype, "putObject").mockImplementation(async input => { objects.set(input.key, input) })
    vi.spyOn(TencentCosObjectStorage.prototype, "getObject").mockImplementation(async key => {
      const object = objects.get(key)
      if (object === undefined) throw Object.assign(new Error("Missing synthetic object"), { statusCode: 404 })
      return object.body
    })
    const moduleRef = await Test.createTestingModule({ imports: [IamModule, ConfigurationModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    await app.close()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it("returns a durable cover path and exact public bytes after an authorized upload", async () => {
    // Given an authorized editor and a PNG with an untrusted original filename.
    const uploaded = await request(app.getHttpServer()).post(route).set(adminHeaders)
      .attach("file", png, { filename: "../../private.png", contentType: "image/png" }).expect(201)
    const path = coverPath(uploaded.body)
    expect(path).toMatch(/^\/catalog-covers\/[0-9a-f-]{36}\.png$/)
    expect([...objects.keys()]).toEqual([path.slice(1)])
    // When the stored cover is requested without credentials.
    const response = await request(app.getHttpServer()).get(path).expect(200)
    // Then only image bytes and public image headers are returned.
    expect(response.body).toEqual(png)
    expect(response.headers).toMatchObject({ "content-type": "image/png", "x-content-type-options": "nosniff", "cache-control": "public, max-age=31536000, immutable" })
  })

  it.each([
    { extension: "jpg", contentType: "image/jpeg", bytes: Buffer.from("ffd8ffe000104a4649460001ffd9", "hex") },
    { extension: "webp", contentType: "image/webp", bytes: Buffer.from("524946460400000057454250", "hex") },
  ])("accepts matching $contentType bytes", async ({ extension, contentType, bytes }) => {
    // Given / When an allowed image is uploaded by an editor.
    const response = await request(app.getHttpServer()).post(route).set(adminHeaders)
      .attach("file", bytes, { filename: `cover.${extension}`, contentType }).expect(201)
    // Then the server chooses the matching extension.
    expect(coverPath(response.body)).toMatch(new RegExp(`\\.${extension}$`))
  })

  it.each([
    { label: "no identity", headers: { Origin: adminHeaders.Origin }, status: 401 },
    { label: "school scope", headers: { ...adminHeaders, "x-linan-dev-staff-role": "school", "x-linan-dev-staff-school-id": "school-a" }, status: 403 },
    { label: "foreign origin", headers: { ...adminHeaders, Origin: "https://other.example.org" }, status: 403 },
  ])("rejects an upload with $label", async ({ headers, status }) => {
    // Given / When an unauthorized request tries to upload a valid image.
    await request(app.getHttpServer()).post(route).set(headers).attach("file", png, "cover.png").expect(status)
    // Then no object reaches storage.
    expect(objects.size).toBe(0)
  })

  it("rejects a configuration writer without global scope", async () => {
    // Given a writer whose permission is limited to one school.
    vi.spyOn(app.get(DevStaffAccessService), "resolve").mockResolvedValue({ actorId: "school-writer", kind: "administrator", forcePasswordChange: false, permissionKeys: new Set(["configuration.write"]), scopes: [{ kind: "school", id: "school-a" }] })
    // When / Then global cover creation is denied.
    await request(app.getHttpServer()).post(route).set(adminHeaders).attach("file", png, "cover.png").expect(403)
    expect(objects.size).toBe(0)
  })

  it("rejects development headers in production", async () => {
    // Given production mode with no real staff session.
    vi.stubEnv("NODE_ENV", "production")
    // When / Then a development identity cannot upload.
    await request(app.getHttpServer()).post(route).set(adminHeaders).attach("file", png, "cover.png").expect(401)
  })

  it("rejects a missing file", async () => {
    // Given / When / Then an editor submits no image.
    await request(app.getHttpServer()).post(route).set(adminHeaders).send({}).expect(400)
  })

  it.each([
    { label: "SVG", bytes: Buffer.from("<svg></svg>"), contentType: "image/svg+xml" },
    { label: "fake PNG", bytes: Buffer.from("<script>alert(1)</script>"), contentType: "image/png" },
    { label: "mismatched MIME", bytes: png, contentType: "image/jpeg" },
    { label: "empty image", bytes: Buffer.alloc(0), contentType: "image/png" },
  ])("rejects $label before writing storage", async ({ bytes, contentType }) => {
    // Given / When invalid content crosses the upload boundary.
    const response = await request(app.getHttpServer()).post(route).set(adminHeaders)
      .attach("file", bytes, { filename: "cover.png", contentType }).expect(400)
    // Then the response is actionable and nothing is stored.
    expect(response.body).toMatchObject({ code: "catalog_cover_input_invalid" })
    expect(objects.size).toBe(0)
  })

  it("accepts a file of exactly 5MiB", async () => {
    // Given a PNG padded to the inclusive size limit.
    const bytes = Buffer.alloc(5 * 1024 * 1024)
    png.copy(bytes)
    // When the editor uploads the exact maximum size.
    const response = await request(app.getHttpServer()).post(route).set(adminHeaders).attach("file", bytes, "cover.png").expect(201)
    // Then storage receives every byte of the accepted image.
    expect(objects.get(coverPath(response.body).slice(1))?.body.equals(bytes)).toBe(true)
  })

  it("rejects files above 5MB", async () => {
    // Given an otherwise valid image exceeding the limit.
    const bytes = Buffer.alloc(5 * 1024 * 1024 + 1)
    png.copy(bytes)
    // When / Then the multipart boundary rejects it.
    const response = await request(app.getHttpServer()).post(route).set(adminHeaders).attach("file", bytes, "cover.png").expect(413)
    expect(response.body).toMatchObject({ message: "封面图片不能超过5MB" })
    expect(objects.size).toBe(0)
  })

  it("rejects a client-supplied object key", async () => {
    // Given / When a request attempts to select a private storage path.
    await request(app.getHttpServer()).post(route).set(adminHeaders).field("objectKey", "media/private.png")
      .attach("file", png, "cover.png").expect(400)
    // Then no object is written.
    expect(objects.size).toBe(0)
  })

  it.each(["private.png", "../media/private.png", "media%2fprivate.png", `${filename}.html`])("rejects the public filename %s", async name => {
    // Given / When / Then a name outside the server-generated format cannot read storage.
    await request(app.getHttpServer()).get(`/catalog-covers/${encodeURIComponent(name)}`).expect(404)
    expect(TencentCosObjectStorage.prototype.getObject).not.toHaveBeenCalled()
  })

  it("returns 404 when the generated image does not exist", async () => {
    // Given / When / Then a valid filename is absent from COS.
    const response = await request(app.getHttpServer()).get(`/catalog-covers/${filename}`).expect(404)
    expect(response.body).toMatchObject({ code: "catalog_cover_not_found" })
  })

  it("starts without COS configuration and reports upload unavailability in Chinese", async () => {
    // Given an app initialized without usable storage credentials.
    vi.stubEnv("TENCENT_CLOUD_SECRET_KEY", "")
    // When / Then startup remains possible but upload truthfully fails.
    const response = await request(app.getHttpServer()).post(route).set(adminHeaders).attach("file", png, "cover.png").expect(503)
    expect(response.body).toMatchObject({ code: "catalog_cover_storage_unavailable", message: "封面图片暂时无法上传，请稍后重试" })
  })

  it("reports COS upload failures without disclosing storage details", async () => {
    // Given an external storage failure.
    vi.mocked(TencentCosObjectStorage.prototype.putObject).mockRejectedValue(new Error("synthetic-storage-secret"))
    // When / Then the editor receives a safe actionable error.
    const response = await request(app.getHttpServer()).post(route).set(adminHeaders).attach("file", png, "cover.png").expect(503)
    expect(response.body).toMatchObject({ message: "封面图片暂时无法上传，请稍后重试" })
    expect(JSON.stringify(response.body)).not.toContain("synthetic-storage-secret")
  })

  it("reports COS read failures as unavailable", async () => {
    // Given a non-missing-object COS failure.
    vi.mocked(TencentCosObjectStorage.prototype.getObject).mockRejectedValue({ statusCode: 403 })
    // When / Then it is not misreported as a missing cover.
    const response = await request(app.getHttpServer()).get(`/catalog-covers/${filename}`).expect(503)
    expect(response.body).toMatchObject({ message: "封面图片暂时无法读取，请稍后重试" })
  })
})

function coverPath(value: unknown): string {
  if (typeof value === "object" && value !== null && "path" in value && typeof value.path === "string") return value.path
  throw new TypeError("Expected a cover path")
}
