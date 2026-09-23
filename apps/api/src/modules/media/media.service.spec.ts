import { ServiceUnavailableException } from "@nestjs/common"
import type { DataSource, EntityManager } from "typeorm"
import { describe, expect, it, vi } from "vitest"
import { AuditLogEntity } from "../../domain/entities/audit-log.entity.js"
import { MediaAssetEntity } from "../../domain/entities/media-asset.entity.js"
import { MediaProviderEntity } from "../../domain/entities/media-provider.entity.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import { MediaService } from "./media.service.js"

const identity = { familyCode: "family-a", actorId: "family-a" }
const staff: StaffAccess = { actorId: "staff-a", kind: "administrator", forcePasswordChange: false, permissionKeys: new Set(["media.upload"]), scopes: [{ kind: "all", id: null }] }
const publishedAsset = Object.assign(new MediaAssetEntity(), {
  id: "asset-a",
  tourSessionId: "session-a",
  title: "合影",
  kind: "image" as const,
  contentType: "image/png",
  byteSize: 12,
  status: "published" as const,
  version: 2,
  authorStaffId: "staff-a",
  createdAt: new Date("2026-09-22T00:00:00.000Z"),
  cleanupPending: false,
  objectKey: "media/session-a/asset-a.png",
})
const enabledProvider = Object.assign(new MediaProviderEntity(), {
  kind: "album" as const,
  label: "图片直播",
  url: "https://album.example.test/a",
  enabled: true,
  version: 1,
})

describe("media service", () => {
  it("lists only published assets and enabled providers for a family order", async () => {
    const manager = { find: vi.fn(async () => [publishedAsset]), findBy: vi.fn(async () => [enabledProvider]) }
    const service = createService(manager)

    await expect(service.familyList(identity, "order-a")).resolves.toEqual({
      assets: [{ id: "asset-a", tourSessionId: "session-a", title: "合影", kind: "image", contentType: "image/png", byteSize: 12, status: "published", version: 2, authorStaffId: "staff-a", createdAt: "2026-09-22T00:00:00.000Z", cleanupPending: false, contentUrl: "https://cos.example.test/media/session-a/asset-a.png" }],
      providers: [{ kind: "album", label: "图片直播", url: "https://album.example.test/a", enabled: true, version: 1 }],
    })
    expect(manager.find).toHaveBeenCalledWith(MediaAssetEntity, { where: { tourSessionId: "session-a", status: "published" }, order: { createdAt: "DESC" } })
    expect(manager.findBy).toHaveBeenCalledWith(MediaProviderEntity, { tourSessionId: "session-a", enabled: true })
  })

  it("serves family content only through the published asset lookup", async () => {
    const body = Buffer.from("image")
    const manager = { findOneBy: vi.fn(async () => publishedAsset) }
    const service = createService(manager, { getObject: vi.fn(async () => body) })

    await expect(service.familyContent(identity, "order-a", "asset-a")).resolves.toEqual({ asset: publishedAsset, body })
    expect(manager.findOneBy).toHaveBeenCalledWith(MediaAssetEntity, { id: "asset-a", tourSessionId: "session-a", status: "published" })
  })

  it("deletes an orphan object when storage upload fails after metadata is created", async () => {
    const manager = createUploadManager()
    const storage = { putObject: vi.fn(async () => { throw new Error("cos unavailable") }), deleteObject: vi.fn(async () => undefined) }
    const service = createService(manager, storage)

    await expect(service.upload(staff, "session-a", {
      body: Buffer.from("89504e470d0a1a0a", "hex"),
      contentType: "image/png",
      extension: "png",
      kind: "image",
      requestId: "e0795057-98bd-4f51-ae71-600fbbd8778f",
      title: "合影",
    })).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(storage.deleteObject).toHaveBeenCalledWith(expect.stringMatching(/^media\/session-a\/.+\.png$/))
    expect(manager.save).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", cleanupPending: false }))
  })
})

function createService(manager: object, storageOverrides: Partial<{ putObject: (input: unknown) => Promise<void>; getObject: (key: string) => Promise<Buffer>; getSignedObjectUrl: (key: string) => string; deleteObject: (key: string) => Promise<void> }> = {}): MediaService {
  const source = { manager, transaction: async (work: (transactionManager: EntityManager) => Promise<unknown>) => work(manager as EntityManager) }
  const database = { getDataSource: vi.fn(async () => source as DataSource) }
  const access = { familySession: vi.fn(async () => "session-a"), staffSession: vi.fn(async () => ({ id: "session-a", organizationId: "school-a" })) }
  const storage = { putObject: vi.fn(async () => undefined), getObject: vi.fn(async () => Buffer.from("")), getSignedObjectUrl: vi.fn((key: string) => `https://cos.example.test/${key}`), deleteObject: vi.fn(async () => undefined), ...storageOverrides }
  return new MediaService(database as never, access as never, storage as never)
}

function createUploadManager(): EntityManager & { readonly save: ReturnType<typeof vi.fn> } {
  return {
    findOneOrFail: vi.fn(async () => ({ id: "session-a" })),
    findOneBy: vi.fn(async () => null),
    create: vi.fn((entity: typeof MediaAssetEntity | typeof AuditLogEntity, values: object) => {
      if (entity === MediaAssetEntity) {
        return Object.assign(new MediaAssetEntity(), values, { status: "uploading", version: 1, cleanupPending: false, createdAt: new Date("2026-09-22T00:00:00.000Z") })
      }
      return Object.assign(new AuditLogEntity(), values)
    }),
    save: vi.fn(async (value) => value),
  } as unknown as EntityManager & { readonly save: ReturnType<typeof vi.fn> }
}
